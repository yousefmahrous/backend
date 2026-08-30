import { doubleCsrf } from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';

const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,

  getSessionIdentifier: (req) => req.session.id,

  cookieName: isProduction ? '__Host-csrf-token' : 'csrf-token',

  cookieOptions: {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  },

  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export { generateCsrfToken as generateToken, doubleCsrfProtection };