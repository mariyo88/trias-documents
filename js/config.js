/**
 * Global app config — API_BASE is resolved based on the current hostname.
 * - localhost / 127.x.x.x / file:// → local dev backend
 * - everything else               → production backend
 */
(function (window) {
    var host = window.location.hostname;
    var isLocal = host === 'localhost' 
        || host === '127.0.0.1' 
        || host.startsWith('127.')
        || host === '';

    window.APP_CONFIG = {
        API_BASE: isLocal
            ? 'http://' + host + ':8080'
            : 'https://optimus-backend-cwbhusfcmq-ew.a.run.app'
    };
})(window);
