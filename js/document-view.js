/**
 * document-view.js — dedicated viewer opened from new-document email links.
 *
 * URL: document.html?id={documentId}
 * Requires login; unauthenticated users are sent to login.html?next=...
 */
(function ($) {
	'use strict';

	var API_BASE = window.APP_CONFIG.API_BASE;
	var TEXT_PREVIEW_TYPES = ['application/json', 'application/xml', 'text/xml', 'text/plain'];
	var IMAGE_PREVIEW_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
	var TYPE_BY_MIME = {
		'application/pdf': { label: 'PDF', cssClass: 'type-pdf' },
		'application/msword': { label: 'DOC', cssClass: 'type-doc' },
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'DOCX', cssClass: 'type-docx' },
		'application/json': { label: 'JSON', cssClass: 'type-json' },
		'application/xml': { label: 'XML', cssClass: 'type-xml' },
		'text/xml': { label: 'XML', cssClass: 'type-xml' },
		'text/plain': { label: 'TXT', cssClass: 'type-txt' },
		'image/jpeg': { label: 'JPG', cssClass: 'type-img' },
		'image/png': { label: 'PNG', cssClass: 'type-img' },
		'image/gif': { label: 'GIF', cssClass: 'type-img' },
		'image/webp': { label: 'WEBP', cssClass: 'type-img' }
	};
	var TYPE_BY_EXT = {
		pdf: { label: 'PDF', cssClass: 'type-pdf' },
		doc: { label: 'DOC', cssClass: 'type-doc' },
		docx: { label: 'DOCX', cssClass: 'type-docx' },
		json: { label: 'JSON', cssClass: 'type-json' },
		xml: { label: 'XML', cssClass: 'type-xml' },
		txt: { label: 'TXT', cssClass: 'type-txt' },
		jpg: { label: 'JPG', cssClass: 'type-img' },
		jpeg: { label: 'JPG', cssClass: 'type-img' },
		png: { label: 'PNG', cssClass: 'type-img' },
		gif: { label: 'GIF', cssClass: 'type-img' },
		webp: { label: 'WEBP', cssClass: 'type-img' }
	};

	var currentDoc = null;

	$(document).ready(function () {
		if (!AuthService.requireAuth()) return;

		var docId = parseDocId(new URLSearchParams(window.location.search).get('id'));
		if (!docId) {
			showError('Link nije ispravan. Nedostaje identifikator dokumenta.');
			return;
		}

		loadDocument(docId);

		$('#doc-download-btn').on('click', function () {
			if (!currentDoc) return;
			downloadDocument(currentDoc.id, currentDoc.fileName);
		});
	});

	function parseDocId(raw) {
		if (!raw) return null;
		var id = parseInt(raw, 10);
		return (Number.isFinite(id) && id > 0 && String(id) === String(raw).trim()) ? id : null;
	}

	function loadDocument(id) {
		showState('loading');

		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(id), {
				method: 'GET',
				headers: headers
			});
		}).then(function (res) {
			if (res.status === 401) {
				AuthService.requireAuth();
				return null;
			}
			if (res.status === 404) {
				throw new Error('Dokument nije pronađen.');
			}
			if (res.status === 403) {
				throw new Error('Nemate pristup ovom dokumentu.');
			}
			if (!res.ok) {
				return res.json().catch(function () { return {}; }).then(function (body) {
					throw new Error((body && body.message) || 'Greška pri učitavanju dokumenta.');
				});
			}
			return res.json();
		}).then(function (doc) {
			if (!doc) return;
			currentDoc = doc;
			renderDocument(doc);
			loadPreview(doc);
		}).catch(function (err) {
			showError((err && err.message) || 'Greška pri učitavanju dokumenta.');
		});
	}

	function renderDocument(doc) {
		var typeInfo = getTypeInfo(doc.contentType, doc.fileName);

		document.title = (doc.fileName || 'Dokument') + ' - FirstCode';
		$('#doc-title').text(doc.fileName || 'Dokument');
		$('#doc-type-badge')
			.attr('class', 'doc-mime-badge ' + typeInfo.cssClass)
			.text(typeInfo.label);

		if (doc.size != null) {
			$('#doc-size').text(formatBytes(doc.size));
			$('#doc-size-item').show();
		}
		if (doc.createdAt) {
			$('#doc-date').text(formatDate(doc.createdAt));
			$('#doc-date-item').show();
		}
		if (doc.uploadedBy) {
			$('#doc-uploader').text(doc.uploadedBy);
			$('#doc-uploader-item').show();
		}

		showState('document');
	}

	function loadPreview(doc) {
		var $body = $('#doc-preview-body');
		var mimeType = doc.contentType || '';
		var fileName = doc.fileName || '';

		$body.html('<div class="doc-preview-loading"><i class="fa fa-spinner fa-spin"></i>Učitavanje pregleda...</div>');

		if (mimeType === 'application/pdf') {
			loadIframePreview($body, doc.id, fileName);
		} else if (TEXT_PREVIEW_TYPES.indexOf(mimeType) !== -1) {
			loadTextPreview($body, doc.id);
		} else if (IMAGE_PREVIEW_TYPES.indexOf(mimeType) !== -1 || mimeType === 'image/jpg') {
			loadImagePreview($body, doc.id, fileName);
		} else if (isWordType(mimeType, fileName)) {
			$body.html(
				'<div class="doc-preview-error">' +
					'<i class="fa fa-file-word-o"></i>' +
					'<p>Pregled nije dostupan za Word dokumente.</p>' +
					'<p>Preuzmite originalni fajl dugmetom iznad.</p>' +
				'</div>'
			);
		} else {
			$body.html(
				'<div class="doc-preview-error">' +
					'<i class="fa fa-ban"></i>' +
					'<p>Pregled nije dostupan za ovaj tip fajla.</p>' +
					'<p>Preuzmite originalni fajl dugmetom iznad.</p>' +
				'</div>'
			);
		}
	}

	function loadImagePreview($body, id, fileName) {
		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(id) + '/preview', {
				method: 'GET', headers: headers
			});
		}).then(function (r) {
			if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
			return r.blob();
		}).then(function (blob) {
			var url = URL.createObjectURL(blob);
			var $img = $('<img>')
				.addClass('doc-preview-image')
				.attr('src', url)
				.attr('alt', fileName || 'Pregled slike');
			$body.empty().append(
				$('<div>').addClass('doc-preview-image-wrap').append($img)
			);
			$body.data('imageObjectUrl', url);
		}).catch(function (err) {
			revokeImagePreviewUrl($body);
			$body.html('<div class="doc-preview-error"><i class="fa fa-exclamation-circle"></i>' +
				'<p>' + escHtml(err.message || 'Nije moguće učitati pregled.') + '</p></div>');
		});
	}

	function revokeImagePreviewUrl($body) {
		var url = $body.data('imageObjectUrl');
		if (url) {
			URL.revokeObjectURL(url);
			$body.removeData('imageObjectUrl');
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
			return PdfPreview.render($body, blob, fileName);
		}).catch(function (err) {
			PdfPreview.cleanup($body);
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

	function downloadDocument(docId, fileName) {
		if (!docId) return;
		AuthService.getValidAuthHeader().then(function (headers) {
			return fetch(API_BASE + '/api/documents/' + encodeURIComponent(docId) + '/download', {
				method: 'GET',
				headers: headers
			});
		}).then(function (res) {
			if (!res.ok) throw new Error('Greška pri preuzimanju.');
			return res.blob().then(function (blob) {
				return { blob: blob, filename: fileName || 'dokument' };
			});
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
			window.alert('Greška pri preuzimanju dokumenta.');
		});
	}

	function showState(name) {
		$('#state-loading, #state-error, #state-document').hide();
		$('#state-' + name).show();
	}

	function showError(message) {
		$('#error-message').text(message);
		showState('error');
	}

	function isWordType(mimeType, fileName) {
		if (mimeType === 'application/msword') return true;
		if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
		var ext = getExtension(fileName || '').toLowerCase();
		return ext === 'doc' || ext === 'docx';
	}

	function getTypeInfo(mimeType, fileName) {
		if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
		if (TYPE_BY_MIME[mimeType]) return TYPE_BY_MIME[mimeType];
		var ext = getExtension(fileName || '').toLowerCase();
		return TYPE_BY_EXT[ext] || { label: (ext || '?').toUpperCase(), cssClass: 'type-other' };
	}

	function getExtension(fileName) {
		var parts = String(fileName || '').split('.');
		return parts.length > 1 ? parts[parts.length - 1] : '';
	}

	function formatBytes(bytes) {
		if (bytes == null) return '—';
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / 1048576).toFixed(1) + ' MB';
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

})(jQuery);
