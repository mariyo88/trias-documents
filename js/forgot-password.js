(function ($) {
	'use strict';

	$(document).ready(function () {
		$('#forgot-form').on('submit', function (e) {
			e.preventDefault();
			var email = $('#email').val().trim();
			if (!email) {
				showAlert('Unesite email adresu.', 'error');
				return;
			}
			var $btn = $('#forgot-btn').prop('disabled', true).text('Slanje...');
			AuthService.forgotPassword(email)
				.then(function () {
					$('#forgot-form').hide();
					$('#back-to-login-link').hide();
					$('#forgot-success').show();
				})
				.catch(function () {
					// Show same success message to prevent enumeration
					$('#forgot-form').hide();
					$('#back-to-login-link').hide();
					$('#forgot-success').show();
				});
		});
	});

	function showAlert(msg, type) {
		$('#auth-alert').removeClass('error success').addClass(type).text(msg).show();
	}

})(jQuery);
