import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { encryptSecret, decryptSecret } from './twofa.crypto.js';
import bcrypt from 'bcrypt';
import * as repository from './auth.repository.js';

const ISSUER = 'Online Store'; 

authenticator.options = { window: 1 };

export const generateSetup = async (email) => {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    encryptedSecret: encryptSecret(secret),
    qrDataUrl,
  };
};

export const verifyCode = (code, encryptedSecret) => {
  const normalized = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;

  try {
    return authenticator.check(normalized, decryptSecret(encryptedSecret));
  } catch {
    return false;
  }
};

const loadUser = async (t, userId) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new Error(t('auth.userNotFound'));
  return user;
};

export const startSetup = async (t, userId) => {
  const user = await loadUser(t, userId);
  if (user.twofa_enabled) throw new Error(t('auth.twofa.alreadyEnabled'));

  const { secret, encryptedSecret, qrDataUrl } = await generateSetup(user.email);
  await repository.saveTwofaSecret(userId, encryptedSecret);
  return { secret, qrDataUrl };
};

export const confirmSetup = async (t, userId, code) => {
  const user = await loadUser(t, userId);
  if (user.twofa_enabled) throw new Error(t('auth.twofa.alreadyEnabled'));
  if (!user.twofa_secret) throw new Error(t('auth.twofa.setupNotStarted'));
  if (!verifyCode(code, user.twofa_secret)) throw new Error(t('auth.twofa.invalidCode'));

  await repository.enableTwofa(userId);
};

export const disable = async (t, userId, password, code) => {
  const user = await loadUser(t, userId);
  if (!user.twofa_enabled) throw new Error(t('auth.twofa.notEnabled'));

  const isMatch = await bcrypt.compare(password ?? '', user.password);
  if (!isMatch) throw new Error(t('auth.oldPasswordInvalid'));
  if (!verifyCode(code, user.twofa_secret)) throw new Error(t('auth.twofa.invalidCode'));

  await repository.disableTwofa(userId);
};

export const verifyLogin = async (t, userId, code) => {
  const user = await loadUser(t, userId);
  if (!user.twofa_enabled || !user.twofa_secret) throw new Error(t('auth.twofa.notEnabled'));
  if (!verifyCode(code, user.twofa_secret)) throw new Error(t('auth.twofa.invalidCode'));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role ? user.role.toLowerCase() : 'customer'
  };
};