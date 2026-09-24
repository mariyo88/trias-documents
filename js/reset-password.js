(function ($) {
	'use strict';

	$(document).ready(function () {
		var token = new URLSearchParams(window.location.search).get('token');
		if (!token) {
			$('#reset-form').hide();
			$('#invalid-token-msg').show();
			return;
		}

		// Password visibility toggle
		$(document).on('click', '.pass-toggle', function () {
			var id = $(this).data('target');
			var $inp = $('#' + id);
			$inp.attr('type', $inp.attr('type') === 'password' ? 'text' : 'password');
			$(this).find('i').toggleClass('fa-eye fa-eye-slash');
		});

		$('#reset-form').on('submit', function (e) {
			e.preventDefault();
			var newPassword     = $('#newPassword').val();
			var confirmPassword = $('#confirmPassword').val();

			if (newPassword.length < 8) {
				showAlert('Lozinka mora imati najmanje 8 znakova.', 'error');
				return;
			}
			if (newPassword !== confirmPassword) {
				showAlert('Lozinke se ne podudaraju.', 'error');
				return;
			}

			var $btn = $('#reset-btn').prop('disabled', true).text('Čuvanje...');
			AuthService.resetPassword(token, newPassword)
				.then(function () {
					$('#reset-form').hide();
					$('#reset-success').show();
				})
				.catch(function (err) {
					$btn.prop('disabled', false).html('<i class="fa fa-save"></i> Sačuvaj lozinku');
					var msg = err.message || 'Greška. Token možda nije validan.';
					showAlert(msg, 'error');
				});
		});
	});

	function showAlert(msg, type) {
		$('#auth-alert').removeClass('error success').addClass(type).text(msg).show();
	}

})(jQuery);
