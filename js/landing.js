/**
 * Public landing — adjusts calls to action when a session already exists.
 */
(function () {
	'use strict';

	document.addEventListener('DOMContentLoaded', function () {
		if (typeof window.AuthService === 'undefined' || !window.AuthService.isLoggedIn()) {
			return;
		}

		var user = window.AuthService.getUser();
		var name = user && user.firstName ? user.firstName : '';
		var note = document.getElementById('landing-auth-note');
		var loginBtn = document.getElementById('landing-login-btn');
		var ctaLogin = document.getElementById('landing-cta-login');

		if (loginBtn) {
			loginBtn.setAttribute('href', 'account.html');
			loginBtn.innerHTML = '<i class="fa fa-user"></i> Moj nalog';
		}
		if (ctaLogin) {
			ctaLogin.setAttribute('href', 'account.html');
			ctaLogin.innerHTML = '<i class="fa fa-user"></i> Moj nalog';
		}

		if (note) {
			note.textContent = name
				? 'Prijavljeni ste kao ' + name + '.'
				: 'Već ste prijavljeni.';
		}
	});
})();
