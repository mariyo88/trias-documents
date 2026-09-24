(function ($) {
	'use strict';

	// Redirect if already logged in
	$(document).ready(function () {
		if (AuthService.isLoggedIn()) {
			window.location.href = 'account.html';
			return;
		}

		// Read ?next= param for post-login redirect
		var nextUrl = new URLSearchParams(window.location.search).get('next') || 'account.html';

		// Password visibility toggle
		$(document).on('click', '.pass-toggle', function () {
			var targetId = $(this).data('target');
			var $input = $('#' + targetId);
			var isPass = $input.attr('type') === 'password';
			$input.attr('type', isPass ? 'text' : 'password');
			$(this).find('i').toggleClass('fa-eye fa-eye-slash');
		});

		$('#login-form').on('submit', function (e) {
			e.preventDefault();
			var email    = $('#email').val().trim();
			var password = $('#password').val();

			if (!email || !password) {
				showAlert('Molimo unesite email i lozinku.', 'error');
				return;
			}

			var $btn = $('#login-btn').prop('disabled', true).text('Prijava...');

			AuthService.login(email, password)
				.then(function () {
					window.location.href = nextUrl;
				})
				.catch(function (err) {
					$btn.prop('disabled', false).html('<i class="fa fa-sign-in"></i> Prijavi se');
					var msg = err.message || 'Greška pri prijavi.';
					if (msg === 'EMAIL_NOT_VERIFIED') {
						showAlert(
							'Email adresa nije potvrđena. ' +
							'<a href="#" id="resend-link">Pošalji ponovo verifikacijski email.</a>',
							'warning'
						);
						$('#resend-link').on('click', function (e) {
							e.preventDefault();
							AuthService.resendVerification(email)
								.then(function () { showAlert('Verifikacijski email je ponovo poslan.', 'success'); })
								.catch(function () { showAlert('Greška pri slanju emaila.', 'error'); });
						});
					} else {
						showAlert(msg, 'error');
					}
				});
		});
	});

	function showAlert(msg, type) {
		$('#auth-alert').removeClass('error success warning').addClass(type).html(msg).show();
	}

})(jQuery);
