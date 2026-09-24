(function ($) {
	'use strict';

	$(document).ready(function () {
		if (AuthService.isLoggedIn()) {
			window.location.href = 'account.html';
			return;
		}

		// Password visibility toggle
		$(document).on('click', '.pass-toggle', function () {
			var id = $(this).data('target');
			var $inp = $('#' + id);
			$inp.attr('type', $inp.attr('type') === 'password' ? 'text' : 'password');
			$(this).find('i').toggleClass('fa-eye fa-eye-slash');
		});

		// Password strength indicator
		$('#password').on('input', function () {
			var v = $(this).val();
			var $bar = $('#pass-strength');
			if (!v) { $bar.attr('class', 'pass-strength'); return; }
			var score = 0;
			if (v.length >= 8)           score++;
			if (/[A-Z]/.test(v))         score++;
			if (/[0-9]/.test(v))         score++;
			if (/[^A-Za-z0-9]/.test(v))  score++;
			if (score <= 1)      $bar.attr('class', 'pass-strength weak');
			else if (score <= 2) $bar.attr('class', 'pass-strength medium');
			else                 $bar.attr('class', 'pass-strength strong');
		});

		var registeredEmail = '';

		$('#register-form').on('submit', function (e) {
			e.preventDefault();
			clearErrors();

			var firstName       = $('#firstName').val().trim();
			var lastName        = $('#lastName').val().trim();
			var email           = $('#email').val().trim();
			var password        = $('#password').val();
			var confirmPassword = $('#confirmPassword').val();

			var valid = true;
			if (!firstName) { showFieldError('firstName', 'Ime je obavezno'); valid = false; }
			if (!lastName)  { showFieldError('lastName',  'Prezime je obavezno'); valid = false; }
			if (!email)     { showFieldError('email',     'Email je obavezan'); valid = false; }
			if (password.length < 8) { showFieldError('password', 'Lozinka mora imati najmanje 8 znakova'); valid = false; }
			if (password !== confirmPassword) { showFieldError('confirmPassword', 'Lozinke se ne podudaraju'); valid = false; }
			if (!valid) return;

			var $btn = $('#register-btn').prop('disabled', true).text('Registracija...');

			AuthService.register(firstName, lastName, email, password)
				.then(function () {
					registeredEmail = email;
					$('#registered-email').text(email);
					$('#register-form').hide();
					$('#register-success').show();
					$('#auth-alert').hide();
				})
				.catch(function (err) {
					$btn.prop('disabled', false).html('<i class="fa fa-user-plus"></i> Registruj se');
					showAlert(err.message || 'Greška pri registraciji.', 'error');
				});
		});

		$(document).on('click', '#resend-verification', function (e) {
			e.preventDefault();
			if (!registeredEmail) return;
			AuthService.resendVerification(registeredEmail)
				.then(function () { showAlert('Verifikacijski email je ponovo poslan.', 'success'); })
				.catch(function () { showAlert('Greška pri slanju emaila.', 'error'); });
		});
	});

	function showAlert(msg, type) {
		$('#auth-alert').removeClass('error success warning').addClass(type).text(msg).show();
	}

	function showFieldError(fieldId, msg) {
		$('#' + fieldId).addClass('is-invalid');
		$('#err-' + fieldId).text(msg).show();
	}

	function clearErrors() {
		$('.form-control').removeClass('is-invalid');
		$('.field-error').hide();
		$('#auth-alert').hide();
	}

})(jQuery);
