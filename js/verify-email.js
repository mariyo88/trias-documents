(function () {
	// Parse token from URL query string
	var params = new URLSearchParams(window.location.search);
	var token = params.get('token');

	function showState(id) {
		['state-loading', 'state-success', 'state-error'].forEach(function (s) {
			document.getElementById(s).style.display = s === id ? '' : 'none';
		});
	}

	if (!token) {
		document.getElementById('error-message').textContent = 'Token za verifikaciju nedostaje u linku.';
		showState('state-error');
		return;
	}

	// Call the API
	AuthService.verifyEmail(token)
		.then(function () {
			showState('state-success');
		})
		.catch(function (err) {
			var msg = (err && err.message) ? err.message : 'Link za verifikaciju je nevažeći ili je istekao.';
			document.getElementById('error-message').textContent = msg;
			showState('state-error');
		});

	// Resend button — needs email, prompt user
	document.getElementById('resend-btn').addEventListener('click', function (e) {
		e.preventDefault();
		var email = prompt('Unesite vašu email adresu da bismo poslali novi link:');
		if (!email) return;
		AuthService.resendVerification(email)
			.then(function () {
				alert('Link za verifikaciju je ponovo poslat na ' + email);
			})
			.catch(function (err) {
				var msg = (err && err.message) ? err.message : 'Slanje nije uspelo. Pokušajte ponovo.';
				alert(msg);
			});
	});
})();
