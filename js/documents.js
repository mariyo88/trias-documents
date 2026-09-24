/**
 * documents.js — Document manager page logic
 *
 * Endpoints:
 *   GET    /api/folders                          — folder tree
 *   POST   /api/folders                          — create folder
 *   PATCH  /api/folders/{id}/rename              — rename folder
 *   DELETE /api/folders/{id}                     — delete folder
 *   POST   /api/documents?folderId=X             — upload into folder
 *   GET    /api/documents?folderId=X             — docs in folder
 *   GET    /api/documents?rootOnly=true          — root docs
 *   GET    /api/documents                        — all docs
 *   PATCH  /api/documents/{id}/move              — move to folder
 *   GET    /api/documents/{id}/preview           — preview
 *   GET    /api/documents/{id}/download          — download
 *
 * Depends on: jQuery, AuthService, APP_CONFIG
 */
(function ($) {
    'use strict';

    var API_BASE = window.APP_CONFIG.API_BASE;

    // ── Constants ──────────────────────────────────────────────────────────

    var SUPPORTED_TYPES = {
        'application/pdf':  { ext: 'pdf',  label: 'PDF',  cssClass: 'type-pdf'  },
        'application/msword': { ext: 'doc', label: 'DOC',  cssClass: 'type-doc'  },
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                            { ext: 'docx', label: 'DOCX', cssClass: 'type-docx' },
        'application/json': { ext: 'json', label: 'JSON', cssClass: 'type-json' },
        'application/xml':  { ext: 'xml',  label: 'XML',  cssClass: 'type-xml'  },
        'text/xml':         { ext: 'xml',  label: 'XML',  cssClass: 'type-xml'  },
        'text/plain':       { ext: 'txt',  label: 'TXT',  cssClass: 'type-txt'  }
    };

    var TEXT_PREVIEW_TYPES = ['application/json', 'application/xml', 'text/xml', 'text/plain'];
    var PAGE_SIZE = 10;

    // ── State ──────────────────────────────────────────────────────────────

    var state = {
        currentPage:     0,
        totalPages:      0,
        currentFolderId: null,   // null = all, 'root' = root only, number = folder id
        folderTree:      [],
        selectedFile:    null,
        searchQuery:     ''      // active search term
    };

    // ── Init ───────────────────────────────────────────────────────────────

    $(document).ready(function () {
        if (!AuthService.requireAuth()) return;

        bindModalClose();
        bindUploadZone();
        bindUploadSubmit();
        bindPreviewModal();
        bindNewFolderModal();
        bindRenameFolderModal();
        bindDeleteFolderModal();
        bindMoveDocModal();
        bindFilterClear();

        $('#new-root-folder-btn').on('click', function () {
            openNewFolderModal(null);
        });

        // ── Header search form ───────────────────────────────────────────
        $('#doc-search-form').on('submit', function (e) {
            e.preventDefault();
            var q = $.trim($('#doc-search-input').val());
            state.searchQuery = q;
            // When searching, clear folder filter so results are global
            if (q) {
                state.currentFolderId = null;
                $('#folder-tree .doc-tree-row').removeClass('active');
                $('#folder-tree .doc-tree-row[data-folder-id="all"]').addClass('active');
            }
            updateFilterBar();
            loadDocuments(0);
        });

        // Clear search when input is manually cleared
        $('#doc-search-input').on('input', function () {
            if ($.trim($(this).val()) === '' && state.searchQuery !== '') {
                state.searchQuery = '';
                updateFilterBar();
                loadDocuments(0);
            }
        });

        loadFolderTree().then(function () {
            loadDocuments(0);
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // MODAL HELPERS
    // ══════════════════════════════════════════════════════════════════════

    function openModal(id) {
        $('#' + id).addClass('open');
        // Focus first input after opening
        setTimeout(function () {
            $('#' + id).find('input').first().focus();
        }, 50);
    }

    function closeModal(id) {
        $('#' + id).removeClass('open');
    }

    function bindModalClose() {
        // Close on overlay click
        $(document).on('click', '.doc-modal-overlay', function (e) {
            if (e.target === this) closeModal($(this).attr('id'));
        });
        // Close via data-modal-close buttons
        $(document).on('click', '[data-modal-close]', function () {
            closeModal($(this).data('modal-close'));
        });
        // Close on Escape
        $(document).on('keydown.modals', function (e) {
            if (e.key === 'Escape') {
                $('.doc-modal-overlay.open').each(function () {
                    closeModal($(this).attr('id'));
                });
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOLDER TREE
    // ══════════════════════════════════════════════════════════════════════

    function loadFolderTree() {
        return AuthService.authFetch('/api/folders')
            .then(function (tree) {
                state.folderTree = tree || [];
                renderFolderTree(tree || []);
                populateMoveSelect(tree || []);
            })
            .catch(function () {
                $('#folder-tree').html(
                    '<li><div style="padding:12px 10px;font-size:12px;color:#c0392b;">' +
                    '<i class="fa fa-exclamation-circle"></i> Greška pri učitavanju.</div></li>'
                );
            });
    }

    function renderFolderTree(tree) {
        var $tree = $('#folder-tree');
        var html = '';

        // "Svi dokumenti" node
        html += buildSpecialNode('all', 'fa-th-list', 'Svi dokumenti', state.currentFolderId === null);
        // "Root" node
        html += buildSpecialNode('root', 'fa-inbox', 'Root (bez foldera)', state.currentFolderId === 'root');

        // Folder nodes
        tree.forEach(function (node) {
            html += buildFolderNode(node, 0);
        });

        $tree.html(html);

        // Bind special nodes
        $tree.off('click.tree').on('click.tree', '.doc-tree-row', function (e) {
            if ($(e.target).closest('.doc-tree-actions').length) return;
            if ($(e.target).closest('.doc-tree-toggle').length) return;

            var $row = $(this);
            var fid  = $row.data('folder-id');

            if (fid === 'all')  state.currentFolderId = null;
            else if (fid === 'root') state.currentFolderId = 'root';
            else state.currentFolderId = parseInt(fid, 10);

            // Clear search when navigating folders
            state.searchQuery = '';
            $('#doc-search-input').val('');

            // Update active state
            $tree.find('.doc-tree-row').removeClass('active');
            $row.addClass('active');

            updateFilterBar();
            loadDocuments(0);
        });

        // Collapse toggle
        $tree.on('click.toggle', '.doc-tree-toggle', function (e) {
            e.stopPropagation();
            var $btn      = $(this);
            var $children = $btn.closest('li').find('> .doc-tree-children').first();
            $btn.toggleClass('open');
            $children.toggleClass('open');
        });

        // Folder action buttons
        $tree.on('click.actions', '.doc-tree-action-btn', function (e) {
            e.stopPropagation();
            var action = $(this).data('action');
            var fid    = parseInt($(this).data('id'), 10);
            var name   = $(this).data('name');

            if (action === 'new-sub')  openNewFolderModal(fid);
            if (action === 'rename')   openRenameFolderModal(fid, name);
            if (action === 'delete')   openDeleteFolderModal(fid, name);
        });
    }

    function buildSpecialNode(fid, icon, label, isActive) {
        return '<li>' +
            '<div class="doc-tree-row special' + (isActive ? ' active' : '') + '" data-folder-id="' + fid + '">' +
            '  <span class="doc-tree-toggle-spacer"></span>' +
            '  <i class="fa ' + icon + ' doc-tree-icon"></i>' +
            '  <span class="doc-tree-label">' + escHtml(label) + '</span>' +
            '</div>' +
            '</li>';
    }

    function buildFolderNode(node, depth) {
        var hasChildren = node.children && node.children.length > 0;
        var isActive    = state.currentFolderId === node.id;
        var indent      = depth > 0 ? 'padding-left:' + (depth * 14) + 'px;' : '';

        var html = '<li>';
        html += '<div class="doc-tree-row' + (isActive ? ' active' : '') + '" data-folder-id="' + node.id + '" style="' + indent + '">';

        // Collapse toggle or spacer
        if (hasChildren) {
            html += '<button class="doc-tree-toggle" title="Razvij/skupi"><i class="fa fa-caret-right"></i></button>';
        } else {
            html += '<span class="doc-tree-toggle-spacer"></span>';
        }

        html += '<i class="fa fa-folder doc-tree-icon"></i>';
        html += '<span class="doc-tree-label">' + escHtml(node.name) + '</span>';

        // Action buttons (visible on hover via CSS)
        html += '<div class="doc-tree-actions">';
        html += '<button class="doc-tree-action-btn" data-action="new-sub" data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Novi podfoleder"><i class="fa fa-folder-o"></i></button>';
        html += '<button class="doc-tree-action-btn" data-action="rename"  data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Preimenuj"><i class="fa fa-pencil"></i></button>';
        html += '<button class="doc-tree-action-btn danger" data-action="delete" data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Obriši"><i class="fa fa-trash"></i></button>';
        html += '</div>';

        html += '</div>'; // .doc-tree-row

        // Children
        if (hasChildren) {
            html += '<ul class="doc-tree-children">';
            node.children.forEach(function (child) {
                html += buildFolderNode(child, depth + 1);
            });
            html += '</ul>';
        }

        html += '</li>';
        return html;
    }

    function findFolderInTree(nodes, id) {
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) return nodes[i];
            if (nodes[i].children) {
                var found = findFolderInTree(nodes[i].children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function updateFilterBar() {
        if (state.searchQuery) {
            $('#doc-filter-name').text('Pretraga: "' + state.searchQuery + '"');
            $('#doc-filter-bar').show();
            return;
        }
        if (state.currentFolderId === null) {
            $('#doc-filter-bar').hide();
            return;
        }
        var label = state.currentFolderId === 'root'
            ? 'Root (bez foldera)'
            : (findFolderInTree(state.folderTree, state.currentFolderId) || {}).name || 'Folder';
        $('#doc-filter-name').text(label);
        $('#doc-filter-bar').show();
    }

    function bindFilterClear() {
        $('#doc-filter-clear').on('click', function () {
            state.currentFolderId = null;
            state.searchQuery = '';
            $('#doc-search-input').val('');
            $('#doc-filter-bar').hide();
            $('#folder-tree .doc-tree-row').removeClass('active');
            $('#folder-tree .doc-tree-row[data-folder-id="all"]').addClass('active');
            loadDocuments(0);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOLDER MODALS
    // ══════════════════════════════════════════════════════════════════════

    function bindNewFolderModal() {
        var $btn   = $('#new-folder-save-btn');
        var $input = $('#new-folder-name');

        $input.on('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $btn.trigger('click'); }
        });

        $btn.on('click', function () {
            var name = $input.val().trim();
            if (!name) {
                $input.addClass('is-invalid');
                $('#new-folder-name-error').addClass('show');
                return;
            }
            $input.removeClass('is-invalid');
            $('#new-folder-name-error').removeClass('show');

            var parentId = $btn.data('parent-id') || null;

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Kreiranje...');

            AuthService.authFetch('/api/folders', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: name, parentId: parentId })
            }).then(function () {
                closeModal('modal-new-folder');
                $input.val('');
                return loadFolderTree();
            }).catch(function (err) {
                showUploadAlert(err.message || 'Greška pri kreiranju foldera.', 'error');
            }).finally(function () {
                $btn.prop('disabled', false).html('<i class="fa fa-check"></i> Kreiraj');
            });
        });
    }

    function openNewFolderModal(parentId) {
        var $btn   = $('#new-folder-save-btn');
        var $input = $('#new-folder-name');

        $btn.data('parent-id', parentId || '');
        $input.val('').removeClass('is-invalid');
        $('#new-folder-name-error').removeClass('show');

        var parentLabel = parentId
            ? ((findFolderInTree(state.folderTree, parentId) || {}).name || 'Folder')
            : null;
        $('#new-folder-parent-label').text(parentLabel ? 'Unutar: ' + parentLabel : 'Root nivo');

        openModal('modal-new-folder');
    }

    function bindRenameFolderModal() {
        var $btn   = $('#rename-folder-save-btn');
        var $input = $('#rename-folder-name');

        $input.on('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $btn.trigger('click'); }
        });

        $btn.on('click', function () {
            var name = $input.val().trim();
            if (!name) {
                $input.addClass('is-invalid');
                $('#rename-folder-name-error').addClass('show');
                return;
            }
            $input.removeClass('is-invalid');
            $('#rename-folder-name-error').removeClass('show');

            var fid = $btn.data('folder-id');
            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Čuvanje...');

            AuthService.authFetch('/api/folders/' + fid + '/rename', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name: name })
            }).then(function () {
                closeModal('modal-rename-folder');
                return loadFolderTree();
            }).catch(function (err) {
                showUploadAlert(err.message || 'Greška pri preimenovanju foldera.', 'error');
            }).finally(function () {
                $btn.prop('disabled', false).html('<i class="fa fa-check"></i> Sačuvaj');
            });
        });
    }

    function openRenameFolderModal(folderId, currentName) {
        var $btn   = $('#rename-folder-save-btn');
        var $input = $('#rename-folder-name');

        $btn.data('folder-id', folderId);
        $input.val(currentName).removeClass('is-invalid');
        $('#rename-folder-name-error').removeClass('show');

        openModal('modal-rename-folder');
    }

    function bindDeleteFolderModal() {
        $('#delete-folder-confirm-btn').on('click', function () {
            var $btn = $(this);
            var fid  = $btn.data('folder-id');

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Brisanje...');

            AuthService.authFetch('/api/folders/' + fid, { method: 'DELETE' })
                .then(function () {
                    closeModal('modal-delete-folder');
                    // If we were browsing this folder, reset to all
                    if (state.currentFolderId === fid) {
                        state.currentFolderId = null;
                        $('#doc-filter-bar').hide();
                    }
                    return loadFolderTree();
                })
                .then(function () {
                    loadDocuments(0);
                })
                .catch(function (err) {
                    showUploadAlert(err.message || 'Greška pri brisanju foldera.', 'error');
                })
                .finally(function () {
                    $btn.prop('disabled', false).html('<i class="fa fa-trash"></i> Obriši');
                });
        });
    }

    function openDeleteFolderModal(folderId, name) {
        $('#delete-folder-confirm-btn').data('folder-id', folderId);
        $('#delete-folder-name-label').text('"' + name + '"');
        openModal('modal-delete-folder');
    }

    // ══════════════════════════════════════════════════════════════════════
    // MOVE DOCUMENT MODAL
    // ══════════════════════════════════════════════════════════════════════

    function bindMoveDocModal() {
        $('#move-doc-confirm-btn').on('click', function () {
            var $btn     = $(this);
            var docId    = $btn.data('doc-id');
            var folderId = $('#move-doc-folder-select').val();
            folderId     = folderId ? parseInt(folderId, 10) : null;

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Premještanje...');

            AuthService.authFetch('/api/documents/' + docId + '/move', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ folderId: folderId })
            }).then(function () {
                closeModal('modal-move-doc');
                loadDocuments(state.currentPage);
            }).catch(function (err) {
                showUploadAlert(err.message || 'Greška pri premještanju dokumenta.', 'error');
            }).finally(function () {
                $btn.prop('disabled', false).html('<i class="fa fa-check"></i> Premesti');
            });
        });
    }

    function openMoveDocModal(docId, docName) {
        $('#move-doc-confirm-btn').data('doc-id', docId);
        $('#move-doc-name-label').text('"' + docName + '"');
        openModal('modal-move-doc');
    }

    function populateMoveSelect(tree) {
        var html = '<option value="">— Root (bez foldera) —</option>';
        html += buildSelectOptions(tree, 0);
        $('#move-doc-folder-select').html(html);
    }

    function buildSelectOptions(nodes, depth) {
        var html = '';
        nodes.forEach(function (node) {
            var prefix = '\u00a0'.repeat(depth * 3);
            html += '<option value="' + node.id + '">' + prefix + escHtml(node.name) + '</option>';
            if (node.children && node.children.length) {
                html += buildSelectOptions(node.children, depth + 1);
            }
        });
        return html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ══════════════════════════════════════════════════════════════════════

    function bindUploadZone() {
        var $zone  = $('#upload-zone');
        var $input = $('#upload-file-input');

        $input.on('change', function () {
            if (this.files && this.files[0]) setSelectedFile(this.files[0]);
        });

        $zone.on('dragover dragenter', function (e) {
            e.preventDefault(); e.stopPropagation();
            $zone.addClass('dragover');
        });
        $zone.on('dragleave drop', function (e) {
            e.preventDefault(); e.stopPropagation();
            $zone.removeClass('dragover');
            if (e.type === 'drop') {
                var files = e.originalEvent.dataTransfer.files;
                if (files && files[0]) setSelectedFile(files[0]);
            }
        });

        $('#upload-clear-btn').on('click', function (e) {
            e.stopPropagation();
            clearSelectedFile();
        });
    }

    function setSelectedFile(file) {
        state.selectedFile = file;
        $('#upload-selected-name').text(file.name);
        $('#upload-selected-size').text(formatBytes(file.size));
        $('#upload-selected-file').css('display', 'flex');
        $('#upload-submit-btn').prop('disabled', false);
        hideUploadAlert();
    }

    function clearSelectedFile() {
        state.selectedFile = null;
        $('#upload-file-input').val('');
        $('#upload-selected-file').hide();
        $('#upload-submit-btn').prop('disabled', true);
        hideUploadAlert();
    }

    function bindUploadSubmit() {
        $('#upload-form').on('submit', function (e) {
            e.preventDefault();
            if (!state.selectedFile) return;
            uploadFile(state.selectedFile);
        });
    }

    function uploadFile(file) {
        var $btn      = $('#upload-submit-btn');
        var $progress = $('#upload-progress-wrap');
        var $bar      = $('#upload-progress-bar');
        var $label    = $('#upload-progress-label');

        if (!isSupportedType(file)) {
            showUploadAlert('Nepodržan format fajla. Dozvoljeni: PDF, DOC, DOCX, JSON, XML, TXT.', 'error');
            return;
        }

        $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Otpremanje...');
        $progress.show();
        $bar.css('width', '0%');
        $label.text('Priprema...');
        hideUploadAlert();

        // Build upload URL — include folderId if a real folder is selected
        var uploadUrl = API_BASE + '/api/documents';
        if (state.currentFolderId && state.currentFolderId !== 'root') {
            uploadUrl += '?folderId=' + state.currentFolderId;
        }

        AuthService.getValidAuthHeader().then(function (authHeaders) {
            var formData = new FormData();
            formData.append('file', file);

            $.ajax({
                url:         uploadUrl,
                method:      'POST',
                data:        formData,
                processData: false,
                contentType: false,
                headers:     authHeaders,
                xhr: function () {
                    var xhr = new window.XMLHttpRequest();
                    xhr.upload.addEventListener('progress', function (e) {
                        if (e.lengthComputable) {
                            var pct = Math.round((e.loaded / e.total) * 100);
                            $bar.css('width', pct + '%');
                            $label.text('Otpremanje... ' + pct + '%');
                        }
                    });
                    return xhr;
                },
                success: function (doc) {
                    $label.text('Završeno!');
                    $bar.css('width', '100%');
                    showUploadAlert(
                        '<i class="fa fa-check-circle"></i> Dokument <strong>' +
                        escHtml(doc.fileName) + '</strong> uspješno otpremljen.',
                        'success'
                    );
                    clearSelectedFile();
                    setTimeout(function () {
                        $progress.hide();
                        loadDocuments(0);
                    }, 800);
                },
                error: function (xhr) {
                    $progress.hide();
                    showUploadAlert(extractError(xhr, 'Greška pri otpremanju dokumenta.'), 'error');
                },
                complete: function () {
                    $btn.prop('disabled', false).html('<i class="fa fa-upload"></i> Otpremi dokument');
                }
            });
        }).catch(function () {
            $btn.prop('disabled', false).html('<i class="fa fa-upload"></i> Otpremi dokument');
            $progress.hide();
            window.location.href = 'login.html';
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENTS LIST
    // ══════════════════════════════════════════════════════════════════════

    function loadDocuments(page) {
        state.currentPage = page;
        showListLoading();

        var params = 'page=' + page + '&size=' + PAGE_SIZE;
        if (state.searchQuery) {
            params += '&search=' + encodeURIComponent(state.searchQuery);
        } else if (state.currentFolderId === 'root') {
            params += '&rootOnly=true';
        } else if (state.currentFolderId !== null) {
            params += '&folderId=' + state.currentFolderId;
        }

        AuthService.authFetch('/api/documents?' + params)
            .then(function (data) {
                var docs, total;
                if (Array.isArray(data)) {
                    docs  = data; total = 1;
                } else {
                    docs  = data.content || [];
                    total = data.totalPages || (docs.length > 0 ? 1 : 0);
                }
                state.totalPages = total;
                renderDocuments(docs);
                renderPagination(page, total);
            })
            .catch(function (err) {
                showListError(err.message || 'Greška pri učitavanju dokumenata.');
            });
    }

    function showListLoading() {
        $('#doc-list-container').html(
            '<tr><td colspan="4"><div class="doc-spinner">' +
            '<i class="fa fa-spinner fa-spin"></i>Učitavanje...</div></td></tr>'
        );
        $('#doc-pagination').html('');
    }

    function showListError(msg) {
        $('#doc-list-container').html(
            '<tr><td colspan="4"><div class="doc-empty-state">' +
            '<i class="fa fa-exclamation-circle"></i>' +
            '<p>' + escHtml(msg) + '</p></div></td></tr>'
        );
    }

    function renderDocuments(docs) {
        if (!docs || docs.length === 0) {
            $('#doc-list-container').html(
                '<tr><td colspan="4"><div class="doc-empty-state">' +
                '<i class="fa fa-file-o"></i>' +
                '<p>Nema dokumenata.</p></div></td></tr>'
            );
            return;
        }

        var rows = docs.map(function (doc) {
            var typeInfo = getTypeInfo(doc.contentType, doc.fileName);
            var dateStr  = formatDate(doc.createdAt);
            var sizeStr  = doc.size != null ? formatBytes(doc.size) : '—';
            var id       = escAttr(String(doc.id));
            var name     = escAttr(doc.fileName);
            var mime     = escAttr(doc.contentType || '');

            var previewBtn = isWordType(doc.contentType, doc.fileName) ? '' :
                '<button class="btn-icon-doc btn-preview-doc" data-id="' + id + '" ' +
                'data-name="' + name + '" data-type="' + mime + '" title="Pregled">' +
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
                '<td>' + escHtml(sizeStr) + '</td>',
                '<td>' + escHtml(dateStr) + '</td>',
                '<td>',
                '  <div class="doc-actions">',
                previewBtn,
                '  <button class="btn-icon-doc btn-download-doc" data-id="' + id + '" data-name="' + name + '" title="Preuzmi">',
                '    <i class="fa fa-download"></i><span>Preuzmi</span>',
                '  </button>',
                '  <button class="btn-icon-doc btn-move-doc" data-id="' + id + '" data-name="' + name + '" title="Premesti u folder">',
                '    <i class="fa fa-share"></i><span>Premesti</span>',
                '  </button>',
                '  </div>',
                '</td>',
                '</tr>'
            ].join('\n');
        }).join('\n');

        $('#doc-list-container').html(rows);

        // Bind actions
        $('#doc-list-container')
            .off('click.docactions')
            .on('click.docactions', '.btn-preview-doc', function () {
                openPreview($(this).data('id'), $(this).data('name'), $(this).data('type'));
            })
            .on('click.docactions', '.btn-download-doc', function () {
                downloadDocument($(this).data('id'), $(this).data('name'));
            })
            .on('click.docactions', '.btn-move-doc', function () {
                openMoveDocModal($(this).data('id'), $(this).data('name'));
            });
    }

    // ── Pagination ─────────────────────────────────────────────────────────

    function renderPagination(page, total) {
        if (total <= 1) { $('#doc-pagination').html(''); return; }

        var btns = '';
        btns += '<button class="doc-page-btn" ' + (page === 0 ? 'disabled' : '') +
                ' data-page="' + (page - 1) + '"><i class="fa fa-chevron-left"></i></button>';
        for (var i = 0; i < total; i++) {
            btns += '<button class="doc-page-btn ' + (i === page ? 'active' : '') +
                    '" data-page="' + i + '">' + (i + 1) + '</button>';
        }
        btns += '<button class="doc-page-btn" ' + (page >= total - 1 ? 'disabled' : '') +
                ' data-page="' + (page + 1) + '"><i class="fa fa-chevron-right"></i></button>';

        $('#doc-pagination').html(btns)
            .off('click.docpages')
            .on('click.docpages', '.doc-page-btn:not(:disabled):not(.active)', function () {
                loadDocuments(parseInt($(this).data('page'), 10));
            });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PREVIEW
    // ══════════════════════════════════════════════════════════════════════

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
        var $body = $('#doc-preview-body');

        $('#preview-modal-title').text(fileName);
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

    // ══════════════════════════════════════════════════════════════════════
    // DOWNLOAD
    // ══════════════════════════════════════════════════════════════════════

    function downloadDocument(id, fileName) {
        AuthService.getValidAuthHeader().then(function (headers) {
            return fetch(API_BASE + '/api/documents/' + encodeURIComponent(id) + '/download', {
                method: 'GET', headers: headers
            });
        }).then(function (r) {
            if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
            return r.blob();
        }).then(function (blob) {
            var url = URL.createObjectURL(blob);
            var $a = $('<a>').attr('href', url).attr('download', fileName)
                .css({ position: 'absolute', left: '-9999px' });
            $('body').append($a);
            $a[0].click();
            setTimeout(function () { URL.revokeObjectURL(url); $a.remove(); }, 2000);
        }).catch(function () {
            window.location.href = 'login.html';
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════

    function showUploadAlert(msg, type) {
        var $el = $('#upload-alert');
        $el.removeClass('error success info').addClass(type).html(msg);
        if (type !== 'success') {
            clearTimeout($el.data('hideTimer'));
            $el.data('hideTimer', setTimeout(function () { $el.hide(); }, 8000));
        }
    }

    function hideUploadAlert() {
        $('#upload-alert').hide().removeClass('error success info');
    }

    function isSupportedType(file) {
        if (SUPPORTED_TYPES[file.type]) return true;
        var ext = getExtension(file.name).toLowerCase();
        return ['pdf', 'doc', 'docx', 'json', 'xml', 'txt'].indexOf(ext) !== -1;
    }

    function isWordType(mimeType, fileName) {
        if (mimeType === 'application/msword') return true;
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
        var ext = getExtension(fileName || '').toLowerCase();
        return ext === 'doc' || ext === 'docx';
    }

    function getTypeInfo(mimeType, fileName) {
        if (SUPPORTED_TYPES[mimeType]) return SUPPORTED_TYPES[mimeType];
        var ext = getExtension(fileName || '').toLowerCase();
        var byExt = {
            pdf:  { ext: 'pdf',  label: 'PDF',  cssClass: 'type-pdf'  },
            doc:  { ext: 'doc',  label: 'DOC',  cssClass: 'type-doc'  },
            docx: { ext: 'docx', label: 'DOCX', cssClass: 'type-docx' },
            json: { ext: 'json', label: 'JSON', cssClass: 'type-json' },
            xml:  { ext: 'xml',  label: 'XML',  cssClass: 'type-xml'  },
            txt:  { ext: 'txt',  label: 'TXT',  cssClass: 'type-txt'  }
        };
        return byExt[ext] || { ext: ext || '?', label: (ext || '?').toUpperCase(), cssClass: 'type-other' };
    }

    function getExtension(fileName) {
        var parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }

    function formatBytes(bytes) {
        if (bytes == null) return '—';
        if (bytes < 1024)    return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function formatDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return d.toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
               ' ' + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
    }

    function extractError(xhr, fallback) {
        if (!xhr) return fallback;
        if (xhr instanceof Error) return xhr.message || fallback;
        if (xhr.responseJSON) return xhr.responseJSON.message || xhr.responseJSON.error || fallback;
        if (xhr.status === 404) return 'Dokument nije pronađen.';
        if (xhr.status === 403) return 'Nemate pristup ovom dokumentu.';
        if (xhr.status === 415) return 'Nepodržan format fajla.';
        if (xhr.status === 0)   return 'Nema veze sa serverom.';
        return fallback;
    }

    function escHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function escAttr(str) { return escHtml(str); }

})(jQuery);
