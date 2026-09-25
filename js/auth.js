/**
 * AuthService — centralni modul za autentikaciju korisnika.
 *
 * Token storage: accessToken + refreshToken u localStorage.
 * Expose-uje se kao window.AuthService za korištenje u svim stranicama.
 */
(function (window) {
    'use strict';

    var API_BASE = window.APP_CONFIG.API_BASE;

    var KEYS = {
        ACCESS_TOKEN:  'optimus_access_token',
        REFRESH_TOKEN: 'optimus_refresh_token',
        USER:          'optimus_user'           // { id, email, firstName, lastName, role }
    };

    var ROLES = {
        ADMIN:    'ADMIN',
        CUSTOMER: 'CUSTOMER',
        VIEWER:   'VIEWER'
    };

    // ─── Token helpers ────────────────────────────────────────────────────────

    function getAccessToken() {
        return localStorage.getItem(KEYS.ACCESS_TOKEN);
    }

    function getRefreshToken() {
        return localStorage.getItem(KEYS.REFRESH_TOKEN);
    }

    function setTokens(accessToken, refreshToken) {
        localStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
        if (refreshToken) {
            localStorage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
        }
    }

    function clearTokens() {
        localStorage.removeItem(KEYS.ACCESS_TOKEN);
        localStorage.removeItem(KEYS.REFRESH_TOKEN);
        localStorage.removeItem(KEYS.USER);
    }

    function getUser() {
        try {
            var raw = localStorage.getItem(KEYS.USER);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setUser(user) {
        localStorage.setItem(KEYS.USER, JSON.stringify(user));
    }

    /**
     * Decode JWT payload without library (base64url decode).
     * Returns null on any error.
     */
    function decodeJwt(token) {
        try {
            var parts = token.split('.');
            if (parts.length !== 3) return null;
            var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            // Pad to multiple of 4
            while (payload.length % 4 !== 0) { payload += '='; }
            return JSON.parse(atob(payload));
        } catch (e) {
            return null;
        }
    }

    function isTokenExpired(token) {
        var payload = decodeJwt(token);
        if (!payload || !payload.exp) return true;
        // exp is in seconds, Date.now() in ms — add 10s buffer
        return (payload.exp * 1000) < (Date.now() + 10000);
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    function isLoggedIn() {
        var token = getAccessToken();
        if (!token) return false;
        // Consider logged in even if access token expired — refresh will fix it
        var refreshToken = getRefreshToken();
        return !!refreshToken;
    }

    function getAuthHeader() {
        var token = getAccessToken();
        return token ? { 'Authorization': 'Bearer ' + token } : {};
    }

    /**
     * Returns a Promise that resolves to { Authorization: 'Bearer <validToken>' }.
     * Auto-refreshes if access token is expired.
     */
    function getValidAuthHeader() {
        var token = getAccessToken();

        if (token && !isTokenExpired(token)) {
            return Promise.resolve({ 'Authorization': 'Bearer ' + token });
        }

        // Access token missing or expired — try refresh
        return refreshToken().then(function (newToken) {
            return { 'Authorization': 'Bearer ' + newToken };
        });
    }

    // ─── Auth operations ──────────────────────────────────────────────────────

    function login(email, password) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/login',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ email: email, password: password }),
                success: function (data) {
                    setTokens(data.accessToken, data.refreshToken);
                    setUser(data.user);
                    resolve(data);
                },
                error: function (xhr) {
                    reject(_extractError(xhr));
                }
            });
        });
    }

    function register(firstName, lastName, email, password) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/register',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    password: password
                }),
                success: function (data) {
                    resolve(data);
                },
                error: function (xhr) {
                    reject(_extractError(xhr));
                }
            });
        });
    }

    function logout() {
        return new Promise(function (resolve) {
            var refreshTokenValue = getRefreshToken();

            // Optimistically clear local state first
            clearTokens();

            if (!refreshTokenValue) {
                resolve();
                return;
            }

            $.ajax({
                url: API_BASE + '/api/auth/logout',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ refreshToken: refreshTokenValue }),
                complete: function () {
                    resolve();
                }
            });
        });
    }

    function refreshToken() {
        var storedRefreshToken = getRefreshToken();

        if (!storedRefreshToken) {
            clearTokens();
            return Promise.reject(new Error('Nema refresh tokena'));
        }

        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/refresh',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ refreshToken: storedRefreshToken }),
                success: function (data) {
                    setTokens(data.accessToken, data.refreshToken);
                    if (data.user) setUser(data.user);
                    resolve(data.accessToken);
                },
                error: function () {
                    // Refresh failed — force logout
                    clearTokens();
                    reject(new Error('Sesija je istekla'));
                }
            });
        });
    }

    function forgotPassword(email) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/forgot-password',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ email: email }),
                success: function (data) { resolve(data); },
                error: function (xhr) { reject(_extractError(xhr)); }
            });
        });
    }

    function resetPassword(token, newPassword) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/reset-password',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ token: token, newPassword: newPassword }),
                success: function (data) { resolve(data); },
                error: function (xhr) { reject(_extractError(xhr)); }
            });
        });
    }

    function verifyEmail(token) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/verify-email',
                method: 'GET',
                data: { token: token },
                success: function (data) { resolve(data); },
                error: function (xhr) { reject(_extractError(xhr)); }
            });
        });
    }

    function resendVerification(email) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: API_BASE + '/api/auth/resend-verification',
                method: 'POST',
                data: { email: email },
                success: function (data) { resolve(data); },
                error: function (xhr) { reject(_extractError(xhr)); }
            });
        });
    }

    /**
     * Make an authenticated API call. Automatically refreshes token if expired.
     * Returns a Promise.
     */
    function authFetch(path, options) {
        options = options || {};
        return getValidAuthHeader().then(function (headers) {
            return new Promise(function (resolve, reject) {
                // Map Fetch API 'body' to jQuery $.ajax 'data'
                var ajaxOptions = Object.assign({}, options);
                if (ajaxOptions.body !== undefined) {
                    ajaxOptions.data = ajaxOptions.body;
                    delete ajaxOptions.body;
                }
                $.ajax(Object.assign({
                    url: API_BASE + path,
                    contentType: 'application/json'
                }, ajaxOptions, {
                    headers: Object.assign(headers, options.headers || {})
                }))
                .done(resolve)
                .fail(function (xhr) {
                    if (xhr.status === 401) {
                        clearTokens();
                        window.location.href = '/login.html';
                        return;
                    }
                    reject(_extractError(xhr));
                });
            });
        }, function () {
            // Token refresh failed — session is gone. API errors (400/403/500) are
            // not handled here so callers can show them.
            window.location.href = '/login.html';
            return new Promise(function () {});
        });
    }

    // ─── Roles ────────────────────────────────────────────────────────────────
    // UI-only convenience checks; the backend enforces the real permissions.

    /**
     * Returns the current user's role. Users stored before roles were exposed
     * (or with an unknown value) are treated as VIEWER — the least-privileged role.
     */
    function getRole() {
        var user = getUser();
        var role = user && user.role;
        return ROLES.hasOwnProperty(role) ? role : ROLES.VIEWER;
    }

    function hasRole() {
        var role = getRole();
        for (var i = 0; i < arguments.length; i++) {
            if (arguments[i] === role) return true;
        }
        return false;
    }

    /**
     * Re-fetches the profile and merges it into the stored user, so a role changed
     * by an admin (or missing from an older login) is picked up without re-login.
     * Resolves with the updated user.
     */
    function refreshUser() {
        return authFetch('/api/account/me').then(function (profile) {
            if (!profile) return getUser();
            var user = Object.assign({}, getUser() || {}, {
                id:        profile.id,
                email:     profile.email,
                firstName: profile.firstName,
                lastName:  profile.lastName,
                role:      profile.role
            });
            setUser(user);
            return user;
        });
    }

    /** Upload, move, create/rename folders. */
    function canWrite() {
        return hasRole(ROLES.ADMIN, ROLES.CUSTOMER);
    }

    /** Delete documents and folders. */
    function canDelete() {
        return hasRole(ROLES.ADMIN);
    }

    // ─── Guard helper ─────────────────────────────────────────────────────────

    /**
     * Redirect to login.html if not logged in.
     * Use at the top of protected pages.
     */
    function requireAuth(redirectUrl) {
        if (!isLoggedIn()) {
            var returnTo = redirectUrl || window.location.href;
            window.location.href = 'login.html?next=' + encodeURIComponent(returnTo);
            return false;
        }
        return true;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    function _extractError(xhr) {
        if (xhr.responseJSON && xhr.responseJSON.message) {
            return new Error(xhr.responseJSON.message);
        }
        if (xhr.status === 0) {
            return new Error('Nema veze sa serverom');
        }
        return new Error('Greška ' + xhr.status);
    }

    // ─── Expose globally ──────────────────────────────────────────────────────

    window.AuthService = {
        isLoggedIn:         isLoggedIn,
        getUser:            getUser,
        getAccessToken:     getAccessToken,
        getAuthHeader:      getAuthHeader,
        getValidAuthHeader: getValidAuthHeader,
        login:              login,
        register:           register,
        logout:             logout,
        refreshToken:       refreshToken,
        forgotPassword:     forgotPassword,
        resetPassword:      resetPassword,
        verifyEmail:        verifyEmail,
        resendVerification: resendVerification,
        authFetch:          authFetch,
        requireAuth:        requireAuth,
        ROLES:              ROLES,
        getRole:            getRole,
        refreshUser:        refreshUser,
        hasRole:            hasRole,
        canWrite:           canWrite,
        canDelete:          canDelete
    };

})(window);
