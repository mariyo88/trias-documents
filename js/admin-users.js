/**
 * admin-users.js — user administration (ADMIN only)
 *
 * Endpoints:
 *   GET   /api/admin/users?page=&size=&search=&role=&status=  — paginated list
 *   PATCH /api/admin/users/{id}/role    { role }               — change role
 *   PATCH /api/admin/users/{id}/status  { status }             — ACTIVE / INACTIVE
 *
 * The backend enforces ADMIN access; the page guard below is only for UX.
 *
 * Depends on: jQuery, AuthService
 */
(function ($) {
	'use strict';

	var PAGE_SIZE = 20;

	var ROLE_LABELS = {
		ADMIN:    'Administrator',
		CUSTOMER: 'Klijent',
		VIEWER:   'Posmatrač'
	};

	var STATUS_LABELS = {
		ACTIVE:               'Aktivan',
		PENDING_VERIFICATION: 'Čeka verifikaciju',
		INACTIVE:             'Deaktiviran'
	};

	var state = {
		page:    0,
		filters: { search: '', role: '', status: '' },
		users:   {},      // id → user, for the current page
		pending: null     // action awaiting confirmation
	};

	var currentEmail = '';

	// ── Init ───────────────────────────────────────────────────────────────

	$(document).ready(function () {
		if (!AuthService.requireAuth()) return;

		AuthService.refreshUser()
			.catch(function () { /* fall back to the stored role */ })
			.then(function () {
				$('#admin-users-loading').addClass('hidden');
				if (!AuthService.hasRole(AuthService.ROLES.ADMIN)) {
					$('#admin-users-denied').removeClass('hidden');
					return;
				}
				var me = AuthService.getUser();
				currentEmail = ((me && me.email) || '').toLowerCase();

				$('#admin-users-content').removeClass('hidden');
				bindFilters();
				bindTableActions();
				bindConfirmModal();
				loadUsers(0);
			});
	});

	// ── Filters ────────────────────────────────────────────────────────────

	function bindFilters() {
		$('#au-filter-form').on('submit', function (e) {
			e.preventDefault();
			readFilters();
			loadUsers(0);
		});

		$('#au-role-filter, #au-status-filter').on('change', function () {
			readFilters();
			loadUsers(0);
		});

		$('#au-reset-btn').on('click', function () {
			$('#au-search').val('');
			$('#au-role-filter').val('');
			$('#au-status-filter').val('');
			readFilters();
			loadUsers(0);
		});
	}

	function readFilters() {
		state.filters.search = $.trim($('#au-search').val());
		state.filters.role   = $('#au-role-filter').val();
		state.filters.status = $('#au-status-filter').val();
	}

	// ── Load & render ──────────────────────────────────────────────────────

	function loadUsers(page) {
		state.page = page;
		$('#au-list').html(
			'<tr><td colspan="5"><div class="spinner"><i class="fa fa-spinner fa-spin"></i> Učitavanje korisnika...</div></td></tr>'
		);
		$('#au-pagination').html('');

		var params = ['page=' + page, 'size=' + PAGE_SIZE];
		if (state.filters.search) params.push('search=' + encodeURIComponent(state.filters.search));
		if (state.filters.role)   params.push('role=' + encodeURIComponent(state.filters.role));
		if (state.filters.status) params.push('status=' + encodeURIComponent(state.filters.status));

		AuthService.authFetch('/api/admin/users?' + params.join('&'))
			.then(function (data) {
				var users = (data && data.content) || [];
				state.users = {};
				users.forEach(function (u) { state.users[u.id] = u; });

				var total = (data && data.totalElements) || 0;
				$('#au-total').text(total === 1 ? '1 korisnik' : total + ' korisnika');

				renderUsers(users);
				renderPagination(data.number || 0, data.totalPages || 0);
			})
			.catch(function (err) {
				$('#au-list').html(
					'<tr><td colspan="5"><div class="empty-state"><i class="fa fa-exclamation-circle"></i>' +
					'<p>' + escHtml(err.message || 'Greška pri učitavanju korisnika.') + '</p></div></td></tr>'
				);
			});
	}

	function renderUsers(users) {
		if (!users.length) {
			$('#au-list').html(
				'<tr><td colspan="5"><div class="empty-state"><i class="fa fa-users"></i>' +
				'<p>Nema korisnika koji odgovaraju filterima.</p></div></td></tr>'
			);
			return;
		}
		$('#au-list').html(users.map(renderRow).join(''));
	}

	function renderRow(u) {
		var isSelf   = (u.email || '').toLowerCase() === currentEmail;
		var fullName = $.trim((u.firstName || '') + ' ' + (u.lastName || '')) || '—';
		var initials = ((u.firstName || '?').charAt(0) + (u.lastName || '').charAt(0)).toUpperCase();

		var roleOptions = Object.keys(ROLE_LABELS).map(function (r) {
			return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>';
		}).join('');

		var roleCell = isSelf
			? '<span class="au-role-badge role-' + escAttr(u.role) + '">' + escHtml(ROLE_LABELS[u.role] || u.role) + '</span>'
			: '<select class="au-role-select" data-id="' + u.id + '" aria-label="Uloga za ' + escAttr(u.email) + '">' +
			  roleOptions + '</select>';

		var statusCell = '<span class="au-status-badge status-' + escAttr(u.status) + '">' +
			escHtml(STATUS_LABELS[u.status] || u.status) + '</span>';

		var action = '';
		if (isSelf) {
			action = '<span class="au-user-email">—</span>';
		} else if (u.status === 'ACTIVE') {
			action = '<button type="button" class="au-action-btn deactivate" data-id="' + u.id + '">' +
				'<i class="fa fa-ban"></i>Deaktiviraj</button>';
		} else {
			action = '<button type="button" class="au-action-btn activate" data-id="' + u.id + '">' +
				'<i class="fa fa-check"></i>Aktiviraj</button>';
		}

		return [
			'<tr class="' + (u.status === 'INACTIVE' ? 'au-row-inactive' : '') + '">',
			'  <td><div class="au-user">',
			'    <div class="au-avatar">' + escHtml(initials) + '</div>',
			'    <div>',
			'      <div class="au-user-name">' + escHtml(fullName) + (isSelf ? '<span class="au-you-tag">Vi</span>' : '') + '</div>',
			'      <div class="au-user-email">' + escHtml(u.email) + '</div>',
			'    </div>',
			'  </div></td>',
			'  <td>' + roleCell + '</td>',
			'  <td>' + statusCell + '</td>',
			'  <td style="white-space:nowrap;color:#888;font-size:12px;">' + escHtml(formatDate(u.createdAt)) + '</td>',
			'  <td class="au-actions">' + action + '</td>',
			'</tr>'
		].join('');
	}

	function renderPagination(page, totalPages) {
		if (totalPages <= 1) { $('#au-pagination').html(''); return; }

		var btns = '<button class="page-btn" ' + (page === 0 ? 'disabled' : '') +
			' data-page="' + (page - 1) + '"><i class="fa fa-chevron-left"></i></button>';
		var start = Math.max(0, page - 2);
		var end   = Math.min(totalPages - 1, page + 2);
		for (var i = start; i <= end; i++) {
			btns += '<button class="page-btn ' + (i === page ? 'active' : '') + '" data-page="' + i + '">' + (i + 1) + '</button>';
		}
		btns += '<button class="page-btn" ' + (page >= totalPages - 1 ? 'disabled' : '') +
			' data-page="' + (page + 1) + '"><i class="fa fa-chevron-right"></i></button>';

		$('#au-pagination').html(btns)
			.off('click')
			.on('click', '.page-btn:not(:disabled):not(.active)', function () {
				loadUsers(parseInt($(this).data('page'), 10));
			});
	}

	// ── Row actions ────────────────────────────────────────────────────────

	function bindTableActions() {
		$('#au-list')
			.on('change', '.au-role-select', function () {
				var $sel = $(this);
				var user = state.users[$sel.data('id')];
				if (!user) return;
				var newRole = $sel.val();

				askConfirm({
					title: 'Promena uloge',
					icon:  'fa-id-badge',
					text:  'Promeniti ulogu korisnika <strong>' + escHtml(user.email) + '</strong> iz ' +
					       '<strong>' + ROLE_LABELS[user.role] + '</strong> u <strong>' + ROLE_LABELS[newRole] + '</strong>?',
					hint:  'Korisnik će biti odjavljen i moraće ponovo da se prijavi.',
					danger: newRole === 'ADMIN',
					run: function () {
						return AuthService.authFetch('/api/admin/users/' + user.id + '/role', {
							method: 'PATCH',
							body:   JSON.stringify({ role: newRole })
						});
					},
					success: 'Uloga korisnika ' + user.email + ' je promenjena u ' + ROLE_LABELS[newRole] + '.',
					cancel: function () { $sel.val(user.role); }
				});
			})
			.on('click', '.au-action-btn.deactivate', function () {
				var user = state.users[$(this).data('id')];
				if (!user) return;
				askConfirm({
					title:  'Deaktivacija korisnika',
					icon:   'fa-ban',
					text:   'Deaktivirati korisnika <strong>' + escHtml(user.email) + '</strong>?',
					hint:   'Korisnik se odmah odjavljuje i više ne može da se prijavi dok ga ponovo ne aktivirate.',
					danger: true,
					run: function () { return updateStatus(user, 'INACTIVE'); },
					success: 'Korisnik ' + user.email + ' je deaktiviran.'
				});
			})
			.on('click', '.au-action-btn.activate', function () {
				var user = state.users[$(this).data('id')];
				if (!user) return;
				askConfirm({
					title: 'Aktivacija korisnika',
					icon:  'fa-check',
					text:  'Aktivirati korisnika <strong>' + escHtml(user.email) + '</strong>?',
					hint:  user.status === 'PENDING_VERIFICATION'
						? 'Email adresa će biti označena kao verifikovana i korisnik će moći odmah da se prijavi.'
						: 'Korisnik će ponovo moći da se prijavi.',
					run: function () { return updateStatus(user, 'ACTIVE'); },
					success: 'Korisnik ' + user.email + ' je aktiviran.'
				});
			});
	}

	function updateStatus(user, status) {
		return AuthService.authFetch('/api/admin/users/' + user.id + '/status', {
			method: 'PATCH',
			body:   JSON.stringify({ status: status })
		});
	}

	// ── Confirm modal ──────────────────────────────────────────────────────

	function askConfirm(action) {
		state.pending = action;
		$('#modal-au-confirm-title').text(action.title);
		$('#au-confirm-icon').attr('class', 'fa ' + action.icon)
			.css('color', action.danger ? '#c0392b' : '#1A5C2A');
		$('#au-confirm-text').html(action.text);
		$('#au-confirm-hint').text(action.hint || '');
		$('#au-confirm-btn').css('background', action.danger ? '#c0392b' : '');
		$('#modal-au-confirm').addClass('open');
		setTimeout(function () { $('#au-confirm-btn').focus(); }, 50);
	}

	function closeConfirm(cancelled) {
		var action = state.pending;
		state.pending = null;
		$('#modal-au-confirm').removeClass('open');
		if (cancelled && action && action.cancel) action.cancel();
	}

	function bindConfirmModal() {
		$('#modal-au-confirm').on('click', function (e) {
			if (e.target === this) closeConfirm(true);
		});
		$('#modal-au-confirm [data-au-cancel]').on('click', function () { closeConfirm(true); });
		$(document).on('keydown.auconfirm', function (e) {
			if (e.key === 'Escape' && state.pending) closeConfirm(true);
		});

		$('#au-confirm-btn').on('click', function () {
			var action = state.pending;
			if (!action) return;
			var $btn = $(this);
			$btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Čuvanje...');

			action.run()
				.then(function () {
					closeConfirm(false);
					showAlert(action.success, 'success');
					loadUsers(state.page);
				})
				.catch(function (err) {
					closeConfirm(true);
					showAlert(err.message || 'Akcija nije uspela.', 'error');
				})
				.finally(function () {
					$btn.prop('disabled', false).html('<i class="fa fa-check"></i> Potvrdi');
				});
		});
	}

	// ── Helpers ────────────────────────────────────────────────────────────

	var alertTimer = null;
	function showAlert(msg, type) {
		var $el = $('#au-alert');
		clearTimeout(alertTimer);
		$el.removeClass('error success').addClass(type).text(msg).show();
		alertTimer = setTimeout(function () { $el.fadeOut(); }, 5000);
	}

	function formatDate(iso) {
		if (!iso) return '—';
		var d = new Date(iso);
		if (isNaN(d.getTime())) return '—';
		return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function escHtml(str) {
		if (str == null) return '';
		return String(str)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;')
			.replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function escAttr(str) { return escHtml(str); }

})(jQuery);
