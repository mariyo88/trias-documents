(function ($) {
	'use strict';

	var API_BASE = window.APP_CONFIG.API_BASE;
	var currentOrderPage = 0;

	// ── Auth guard ────────────────────────────────────────────────────────
	$(document).ready(function () {
		if (!AuthService.requireAuth()) return;

		// Check hash for direct tab navigation (e.g. account.html#orders)
		var hash = window.location.hash.replace('#', '');
		if (hash && $('#panel-' + hash).length) {
			switchTab(hash);
		}

		loadProfile();

		// ── Tab navigation ────────────────────────────────────────────────
		$(document).on('click', '.account-nav a[data-tab]', function (e) {
			e.preventDefault();
			var tab = $(this).data('tab');
			switchTab(tab);
			window.location.hash = tab;
		});

		// ── Logout ────────────────────────────────────────────────────────
		$('#account-logout-btn').on('click', function (e) {
			e.preventDefault();
			AuthService.logout().then(function () {
				window.location.href = 'index.html';
			});
		});

		// ── Profile form ─────────────────────────────────────────────────
		$('#profile-form').on('submit', function (e) {
			e.preventDefault();
			var $btn = $('#profile-save-btn').prop('disabled', true).text('Čuvanje...');

			AuthService.authFetch('/api/account/me', {
				method: 'PUT',
				data: JSON.stringify({
					firstName: $('#prof-firstName').val().trim(),
					lastName:  $('#prof-lastName').val().trim(),
					phone:     $('#prof-phone').val().trim() || null
				})
			}).then(function (data) {
				$btn.prop('disabled', false).html('<i class="fa fa-save"></i> Sačuvaj promene');
				updateSidebar(data);
				showPanelAlert('profile', 'Profil je uspješno ažuriran.', 'success');
			}).catch(function (err) {
				$btn.prop('disabled', false).html('<i class="fa fa-save"></i> Sačuvaj promene');
				showPanelAlert('profile', err.message || 'Greška pri čuvanju.', 'error');
			});
		});

		// ── Password form ─────────────────────────────────────────────────
		$('#password-form').on('submit', function (e) {
			e.preventDefault();
			var curr    = $('#curr-password').val();
			var newPass = $('#new-password').val();
			var confirm = $('#confirm-password').val();

			if (!curr || !newPass || !confirm) {
				showPanelAlert('password', 'Popunite sva polja.', 'error');
				return;
			}
			if (newPass.length < 8) {
				showPanelAlert('password', 'Nova lozinka mora imati najmanje 8 znakova.', 'error');
				return;
			}
			if (newPass !== confirm) {
				showPanelAlert('password', 'Lozinke se ne podudaraju.', 'error');
				return;
			}

			var $btn = $('#password-save-btn').prop('disabled', true).text('Čuvanje...');

			AuthService.authFetch('/api/account/me/password', {
				method: 'PUT',
				data: JSON.stringify({ currentPassword: curr, newPassword: newPass })
			}).then(function () {
				$btn.prop('disabled', false).html('<i class="fa fa-save"></i> Promijeni lozinku');
				$('#password-form')[0].reset();
				showPanelAlert('password', 'Lozinka je uspješno promenjena.', 'success');
			}).catch(function (err) {
				$btn.prop('disabled', false).html('<i class="fa fa-save"></i> Promijeni lozinku');
				showPanelAlert('password', err.message || 'Greška pri promeni lozinke.', 'error');
			});
		});

		// ── Password toggle ───────────────────────────────────────────────
		$(document).on('click', '.pass-toggle', function () {
			var id = $(this).data('target');
			var $inp = $('#' + id);
			$inp.attr('type', $inp.attr('type') === 'password' ? 'text' : 'password');
			$(this).find('i').toggleClass('fa-eye fa-eye-slash');
		});

		// ── Order detail modal ────────────────────────────────────────────
		$(document).on('click', '.order-detail-btn', function () {
			var orderId = $(this).data('id');
			loadOrderDetail(orderId);
		});

		$('#modal-close, #order-detail-overlay').on('click', function (e) {
			if (e.target === this) $('#order-detail-overlay').removeClass('open');
		});

		$(document).on('keydown', function (e) {
			if (e.key === 'Escape') $('#order-detail-overlay').removeClass('open');
		});
	});

	// ── Tab switch ────────────────────────────────────────────────────────
	function switchTab(tab) {
		$('.account-nav a').removeClass('active');
		$('.account-nav a[data-tab="' + tab + '"]').addClass('active');
		$('.account-panel').removeClass('active');
		$('#panel-' + tab).addClass('active');

		if (tab === 'orders' && $('#orders-container .spinner').length) {
			loadOrders(0);
		}
	}

	// ── Load profile ──────────────────────────────────────────────────────
	function loadProfile() {
		AuthService.authFetch('/api/account/me').then(function (data) {
			$('#prof-firstName').val(data.firstName);
			$('#prof-lastName').val(data.lastName);
			$('#prof-email').val(data.email);
			$('#prof-phone').val(data.phone || '');
			updateSidebar(data);
		}).catch(function () {
			showPanelAlert('profile', 'Greška pri učitavanju profila.', 'error');
		});
	}

	function updateSidebar(data) {
		var initials = ((data.firstName || '?')[0] + (data.lastName || '')[0]).toUpperCase();
		$('#sidebar-avatar').text(initials);
		$('#sidebar-name').text(data.firstName + ' ' + data.lastName);
		$('#sidebar-email').text(data.email);
	}

	// ── Load orders ───────────────────────────────────────────────────────
	function loadOrders(page) {
		currentOrderPage = page;
		$('#orders-container').html('<div class="spinner"><i class="fa fa-spinner fa-spin"></i> Učitavanje...</div>');

		AuthService.authFetch('/api/account/orders?page=' + page + '&size=10').then(function (data) {
			if (!data.content || data.content.length === 0) {
				$('#orders-container').html(
					'<div class="empty-state"><i class="fa fa-inbox"></i><p>Nemate narudžbine.</p>' +
					'<a href="store.html" class="save-btn" style="display:inline-block;text-decoration:none;padding:10px 24px;">Idite u prodavnicu</a></div>'
				);
				$('#orders-pagination').html('');
				return;
			}

			var rows = data.content.map(function (o) {
				return [
					'<tr>',
					'  <td><strong>#' + o.orderNumber + '</strong></td>',
					'  <td>' + formatDate(o.createdAt) + '</td>',
					'  <td><span class="order-status-badge status-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>',
					'  <td style="font-weight:700;color:#0A0A0A;">' + formatPrice(o.totalPrice) + '</td>',
					'  <td><button class="order-detail-btn" data-id="' + o.id + '"><i class="fa fa-eye"></i> Detalji</button></td>',
					'</tr>'
				].join('');
			}).join('');

			var table = [
				'<div style="overflow-x:auto;">',
				'<table class="orders-table">',
				'<thead><tr><th>Broj</th><th>Datum</th><th>Status</th><th>Ukupno</th><th></th></tr></thead>',
				'<tbody>' + rows + '</tbody>',
				'</table></div>'
			].join('');
			$('#orders-container').html(table);

			renderPagination(data.page, data.totalPages);
		}).catch(function () {
			$('#orders-container').html('<div class="empty-state"><i class="fa fa-exclamation-circle"></i><p>Greška pri učitavanju narudžbina.</p></div>');
		});
	}

	function renderPagination(page, totalPages) {
		if (totalPages <= 1) { $('#orders-pagination').html(''); return; }
		var btns = '';
		btns += '<button class="page-btn" ' + (page === 0 ? 'disabled' : '') + ' data-page="' + (page - 1) + '"><i class="fa fa-chevron-left"></i></button>';
		for (var i = 0; i < totalPages; i++) {
			btns += '<button class="page-btn ' + (i === page ? 'active' : '') + '" data-page="' + i + '">' + (i + 1) + '</button>';
		}
		btns += '<button class="page-btn" ' + (page >= totalPages - 1 ? 'disabled' : '') + ' data-page="' + (page + 1) + '"><i class="fa fa-chevron-right"></i></button>';
		$('#orders-pagination').html(btns);

		$('#orders-pagination').on('click', '.page-btn:not(:disabled):not(.active)', function () {
			loadOrders(parseInt($(this).data('page')));
		});
	}

	// ── Order detail ──────────────────────────────────────────────────────
	function loadOrderDetail(orderId) {
		$('#modal-order-body').html('<div class="spinner"><i class="fa fa-spinner fa-spin"></i></div>');
		$('#order-detail-overlay').addClass('open');

		AuthService.authFetch('/api/account/orders/' + orderId).then(function (o) {
			var infoHtml = [
				'<div class="order-info-row"><span class="label">Broj narudžbine</span><span class="value">#' + o.orderNumber + '</span></div>',
				'<div class="order-info-row"><span class="label">Datum</span><span class="value">' + formatDate(o.createdAt) + '</span></div>',
				'<div class="order-info-row"><span class="label">Status</span><span class="value"><span class="order-status-badge status-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></span></div>',
				'<div class="order-info-row"><span class="label">Adresa dostave</span><span class="value" style="max-width:280px;word-break:break-word;">' + o.deliveryAddress + '</span></div>',
				'<div class="order-info-row"><span class="label">Ukupno</span><span class="value" style="color:#0A0A0A;font-size:16px;">' + formatPrice(o.totalPrice) + '</span></div>'
			].join('');

			var itemsHtml = (o.items || []).map(function (item) {
				return [
					'<div class="order-item-row">',
					'  <span class="order-item-name">' + item.productName + '</span>',
					'  <span class="order-item-qty">x' + item.quantity + '</span>',
					'  <span class="order-item-price">' + formatPrice(item.totalPrice) + '</span>',
					'</div>'
				].join('');
			}).join('');

			$('#modal-order-title').text('Narudžba #' + o.orderNumber);
			$('#modal-order-body').html(
				'<div>' + infoHtml + '</div>' +
				'<div class="order-items-list"><strong style="font-size:13px;color:#666;display:block;margin:16px 0 8px;">Stavke narudžbine</strong>' + itemsHtml + '</div>'
			);
		}).catch(function () {
			$('#modal-order-body').html('<p style="color:#c0392b;font-size:13px;">Greška pri učitavanju narudžbine.</p>');
		});
	}

	// ── Alert helper ──────────────────────────────────────────────────────
	function showPanelAlert(panel, msg, type) {
		var $el = $('#' + panel + '-alert');
		$el.removeClass('error success').addClass(type).text(msg).show();
		setTimeout(function () { $el.fadeOut(); }, 5000);
	}

	// ── Formatters ────────────────────────────────────────────────────────
	function formatPrice(val) {
		if (val == null) return '—';
		return Number(val).toLocaleString('sr-RS', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' RSD';
	}

	function formatDate(iso) {
		if (!iso) return '—';
		var d = new Date(iso);
		return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function statusLabel(s) {
		var map = {
			CREATED: 'Kreirana', CONFIRMED: 'Potvrđena', PROCESSING: 'Obrađuje se',
			SHIPPED: 'Poslata', DELIVERED: 'Isporučena', CANCELLED: 'Otkazana'
		};
		return map[s] || s;
	}

})(jQuery);
