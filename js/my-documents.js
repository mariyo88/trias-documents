(function ($) {
	'use strict';

	var PAGE_SIZE = 10;
	var API_BASE = window.APP_CONFIG.API_BASE;
	var TEXT_PREVIEW_TYPES = ['application/json', 'application/xml', 'text/xml', 'text/plain'];
	var TYPE_BY_MIME = {
		'application/pdf': { label: 'PDF', cssClass: 'type-pdf' },
		'application/msword': { label: 'DOC', cssClass: 'type-doc' },
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', cssClass: 'type-docx' },
		'application/json': { label: 'JSON', cssClass: 'type-json' },
		'application/xml': { label: 'XML', cssClass: 'type-xml' },
		'text/xml': { label: 'XML', cssClass: 'type-xml' },
		'text/plain': { label: 'TXT', cssClass: 'type-txt' }
	};
	var TYPE_BY_EXT = {
		pdf: { label: 'PDF', cssClass: 'type-pdf' },
		doc: { label: 'DOC', cssClass: 'type-doc' },
		docx: { label: 'DOCX', cssClass: 'type-docx' },
		json: { label: 'JSON', cssClass: 'type-json' },
		xml: { label: 'XML', cssClass: 'type-xml' },
		txt: { label: 'TXT', cssClass: 'type-txt' }
	};
	var currentPage = 0;
	var currentSearch = '';

	// ── Auth guard ────────────────────────────────────────────────────────
	$(document).ready(function () {
		if (!AuthService.requireAuth()) return;

		loadProfile();
		loadDocuments(0, '');

		// ── Search ────────────────────────────────────────────────────────
		$('#my-docs-search-form').on('submit', function (e) {
			e.preventDefault();
			currentSearch = $('#my-docs-search').val().trim();
			updateSearchFilter();
			loadDocuments(0, currentSearch);
		});

		$('#my-docs-clear-btn').on('click', function () {
			currentSearch = '';
			$('#my-docs-search').val('');
			updateSearchFilter();
			loadDocuments(0, '');
		});

		// ── Logout ────────────────────────────────────────────────────────
		$('#account-logout-btn').on('click', function (e) {
			e.preventDefault();
			AuthService.logout().then(function () {
				window.location.href = 'index.html';
			});
		});

		// ── Download / Preview delegation ─────────────────────────────────
		$(document).on('click', '.my-doc-download', function () {
			downloadDocument($(this).attr('data-id'), $(this).attr('data-name'));
		});

		$(document).on('click', '.my-doc-preview', function () {
			openPreview(
				$(this).attr('data-id'),
				$(this).attr('data-name'),
				$(this).attr('data-type')
			);
		});

		bindPreviewModal();
	});

	// ── Load sidebar profile ──────────────────────────────────────────────
	function loadProfile() {
		AuthService.authFetch('/api/account/me').then(function (data) {
			var initials = ((data.firstName || '?')[0] + (data.lastName || '')[0]).toUpperCase();
			$('#sidebar-avatar').text(initials);
			$('#sidebar-name').text(data.firstName + ' ' + data.lastName);
			$('#sidebar-email').text(data.email);
		}).catch(function () {
			// sidebar stays at defaults — not a blocking error
		});
	}

	// ── Load documents ────────────────────────────────────────────────────
	function loadDocuments(page, search) {
		currentPage = page;

		$('#my-docs-container').html(
			'<tr class="doc-table-message"><td colspan="4"><div class="doc-spinner">' +
			'<i class="fa fa-spinner fa-spin"></i>Učitavanje...</div></td></tr>'
		);
		$('#my-docs-pagination').html('');

		var url = '/api/documents/my?page=' + page + '&size=' + PAGE_SIZE;
		if (search) url += '&search=' + encodeURIComponent(search);

		AuthService.authFetch(url).then(function (data) {
			renderDocuments(data);
		}).catch(function (err) {
			$('#my-docs-container').html(
				'<tr class="doc-table-message"><td colspan="4"><div class="doc-empty-state">' +
				'<i class="fa fa-exclamation-circle"></i>' +
				'<p>' + escHtml(err.message || 'Greška pri učitavanju dokumenata.') + '</p></div></td></tr>'
			);
		});
	}

	// ── Render documents ──────────────────────────────────────────────────
	function renderDocuments(data) {
		var docs = data.content || [];

		if (docs.length === 0) {
			var emptyMsg = currentSearch
				? 'Nema dokumenata koji odgovaraju pretrazi „' + escHtml(currentSearch) + '“.'
				: 'Niste otpremili nijedan dokument.';
			$('#my-docs-container').html(
				'<tr class="doc-table-message"><td colspan="4"><div class="doc-empty-state">' +
				'<i class="fa fa-file-o"></i><p>' + emptyMsg + '</p></div></td></tr>'
			);
			$('#my-docs-pagination').html('');
			return;
		}

		var rows = docs.map(function (doc) {
			var typeInfo = getTypeInfo(doc.contentType, doc.fileName);
			var size = formatSize(doc.size);
			var date = formatDate(doc.createdAt);
			var name = escAttr(doc.fileName);
			var id = escAttr(String(doc.id));
			var mime = escAttr(doc.contentType || '');
			var previewBtn = isWordType(doc.contentType, doc.fileName) ? '' :
				'<button class="btn-icon-doc my-doc-preview" type="button" data-id="' + id +
				'" data-name="' + name + '" data-type="' + mime + '" title="Pregled">' +
				'<i class="fa fa-eye"></i><span>Pregled</span></button>';

			return [
				'<tr>',
				'<td>',
				'  <div class="doc-name-cell">',
				'    <div class="doc-type-icon ' + typeInfo.cssClass + '">' + typeInfo.label + '</div>',
				'    <div class="doc-file-name">',
				'      ' + escHtml(doc.fileName),
				'      <small>' + escHtml(doc.contentType || '') + '</small>',
				'    </div>',
				'  </div>',
				'</td>',
				'<td>' + escHtml(size) + '</td>',
				'<td>' + escHtml(date) + '</td>',
				'<td>',
				'  <div class="doc-actions">',
				previewBtn,
				'    <button class="btn-icon-doc my-doc-download" type="button" data-id="' + id +
				'" data-name="' + name + '" title="Preuzmi">',
				'      <i class="fa fa-download"></i><span>Preuzmi</span>',
				'    </button>',
				'  </div>',
				'</td>',
				'</tr>'
			].join('');
		}).join('');

		$('#my-docs-container').html(rows);
		renderPagination(data.number, data.totalPages);
	}

	// ── Pagination ────────────────────────────────────────────────────────
	function renderPagination(page, totalPages) {
		if (totalPages <= 1) { $('#my-docs-pagination').html(''); return; }

		var btns = '';
		btns += '<button class="doc-page-btn" ' + (page === 0 ? 'disabled' : '') +
			' data-page="' + (page - 1) + '"><i class="fa fa-chevron-left"></i></button>';

		var start = Math.max(0, page - 2);
		var end   = Math.min(totalPages - 1, page + 2);

		if (start > 0) btns += '<button class="doc-page-btn" data-page="0">1</button>';
		if (start > 1) btns += '<span class="doc-page-ellipsis">…</span>';

		for (var i = start; i <= end; i++) {
			btns += '<button class="doc-page-btn ' + (i === page ? 'active' : '') +
				'" data-page="' + i + '">' + (i + 1) + '</button>';
		}

		if (end < totalPages - 2) btns += '<span class="doc-page-ellipsis">…</span>';
		if (end < totalPages - 1) btns += '<button class="doc-page-btn" data-page="' + (totalPages - 1) + '">' + totalPages + '</button>';

		btns += '<button class="doc-page-btn" ' + (page >= totalPages - 1 ? 'disabled' : '') +
			' data-page="' + (page + 1) + '"><i class="fa fa-chevron-right"></i></button>';

		var $pag = $('#my-docs-pagination').html(btns);
		$pag.off('click').on('click', '.doc-page-btn:not(:disabled):not(.active)', function () {
			loadDocuments(parseInt($(this).data('page')), currentSearch);
			$('html, body').animate({ scrollTop: $('.account-section').offset().top - 20 }, 300);
		});
	}

	// ── Download ──────────────────────────────────────────────────────────
	function downloadDocument(docId, fileName) {
		if (!docId) return;
		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(docId) + '/download', {
				method: 'GET',
				headers: headers
			});
		}).then(function (res) {
			if (!res.ok) throw new Error('Greška pri preuzimanju.');
			var disposition = res.headers.get('Content-Disposition') || '';
			var match = disposition.match(/filename\*?=(?:UTF-8''|(['"]?))([^'"\n;]+)\1/i);
			var filename = fileName || (match ? decodeURIComponent(match[2]) : 'dokument');
			return res.blob().then(function (blob) { return { blob: blob, filename: filename }; });
		}).then(function (result) {
			var blobUrl = URL.createObjectURL(result.blob);
			var link = document.createElement('a');
			link.href = blobUrl;
			link.download = result.filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 2000);
		}).catch(function () {
			showAlert('Greška pri preuzimanju dokumenta.', 'error');
		});
	}

	// ── Preview ───────────────────────────────────────────────────────────
	function bindPreviewModal() {
		$('#doc-preview-overlay').on('click', function (e) {
			if (e.target === this) closePreview();
		});
		$('#preview-close-btn').on('click', closePreview);
		$(document).on('keydown.docpreview', function (e) {
			if (e.key === 'Escape') closePreview();
		});
	}

	function openPreview(id, fileName, mimeType) {
		if (!id) return;
		var $body = $('#doc-preview-body');

		$('#preview-modal-title').text(fileName || 'Pregled dokumenta');
		$('#preview-download-btn').off('click.previewdl').on('click.previewdl', function () {
			downloadDocument(id, fileName);
		});

		$body.html('<div class="doc-preview-loading"><i class="fa fa-spinner fa-spin"></i>Učitavanje pregleda...</div>');
		$('#doc-preview-overlay').addClass('open');

		if (mimeType === 'application/pdf') {
			loadIframePreview($body, id, fileName);
		} else if (TEXT_PREVIEW_TYPES.indexOf(mimeType) !== -1) {
			loadTextPreview($body, id);
		} else {
			$body.html('<div class="doc-preview-error"><i class="fa fa-ban"></i>' +
				'<p>Pregled nije dostupan za ovaj tip fajla.</p></div>');
		}
	}

	function loadIframePreview($body, id, fileName) {
		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(id) + '/preview', {
				method: 'GET', headers: headers
			});
		}).then(function (r) {
			if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
			return r.blob();
		}).then(function (blob) {
			var url = URL.createObjectURL(blob);
			$body.data('blobUrl', url);
			$body.html('<iframe src="' + url + '" title="' + escAttr(fileName) + '"></iframe>');
		}).catch(function (err) {
			$body.html('<div class="doc-preview-error"><i class="fa fa-exclamation-circle"></i>' +
				'<p>' + escHtml(err.message || 'Nije moguće učitati pregled.') + '</p></div>');
		});
	}

	function loadTextPreview($body, id) {
		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(id) + '/preview', {
				method: 'GET', headers: headers
			});
		}).then(function (r) {
			if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
			return r.text();
		}).then(function (text) {
			$body.html('<pre>' + escHtml(text) + '</pre>');
		}).catch(function (err) {
			$body.html('<div class="doc-preview-error"><i class="fa fa-exclamation-circle"></i>' +
				'<p>' + escHtml((err && err.message) || 'Greška pri učitavanju pregleda.') + '</p></div>');
		});
	}

	function closePreview() {
		var $body = $('#doc-preview-body');
		var blobUrl = $body.data('blobUrl');
		if (blobUrl) { URL.revokeObjectURL(blobUrl); $body.removeData('blobUrl'); }
		$('#doc-preview-overlay').removeClass('open');
		$body.html('');
	}

	// ── Alert ─────────────────────────────────────────────────────────────
	function showAlert(msg, type) {
		var $el = $('#my-docs-alert');
		$el.removeClass('error success').addClass(type).text(msg).show();
		setTimeout(function () { $el.fadeOut(); }, 5000);
	}

	// ── Helpers ───────────────────────────────────────────────────────────
	function updateSearchFilter() {
		if (currentSearch) {
			$('#my-docs-filter-name').text(currentSearch);
			$('#my-docs-filter-bar').show();
		} else {
			$('#my-docs-filter-bar').hide();
		}
	}

	function getTypeInfo(mime, fileName) {
		if (mime && TYPE_BY_MIME[mime]) return TYPE_BY_MIME[mime];
		var ext = getExtension(fileName || '').toLowerCase();
		return TYPE_BY_EXT[ext] || { label: (ext || '?').toUpperCase(), cssClass: 'type-other' };
	}

	function getExtension(fileName) {
		var parts = String(fileName).split('.');
		return parts.length > 1 ? parts[parts.length - 1] : '';
	}

	function isWordType(mime, fileName) {
		if (mime === 'application/msword') return true;
		if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
		var ext = getExtension(fileName || '').toLowerCase();
		return ext === 'doc' || ext === 'docx';
	}

	function formatSize(bytes) {
		if (bytes == null) return '—';
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function formatDate(iso) {
		if (!iso) return '—';
		var d = new Date(iso);
		return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
			' ' + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
	}

	function escHtml(str) {
		if (str == null) return '';
		return String(str)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;')
			.replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function escAttr(str) { return escHtml(str); }

})(jQuery);
