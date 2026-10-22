// Exposes Netlify Identity to the page's inline script, then starts the app.
import {
  login,
  signup,
  logout,
  getUser,
  handleAuthCallback,
  requestPasswordRecovery,
  updateUser,
  acceptInvite,
  AuthError,
  MissingIdentityError,
} from '@netlify/identity';

window.identity = {
  login,
  signup,
  logout,
  getUser,
  handleAuthCallback,
  requestPasswordRecovery,
  updateUser,
  acceptInvite,
  AuthError,
  MissingIdentityError,
};

window.initApp();
