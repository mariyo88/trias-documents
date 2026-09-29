/**
 * documents.js — Document manager page logic
 *
 * Endpoints:
 *   GET    /api/folders                          — folder tree (filtered by READ)
 *   POST   /api/folders                          — create folder (ADMIN)
 *   PATCH  /api/folders/{id}/rename              — rename folder (ADMIN)
 *   DELETE /api/folders/{id}                     — delete folder (ADMIN)
 *   GET/PUT /api/folders/{id}/permissions        — folder ACL (ADMIN)
 *   POST   /api/documents?folderId=X             — upload (needs WRITE)
 *   GET    /api/documents?folderId=X             — docs in folder (needs READ)
 *   GET    /api/documents?rootOnly=true          — root docs (ADMIN)
 *   GET    /api/documents                        — all visible docs
 *   PATCH  /api/documents/{id}/move              — move (DELETE src + WRITE dst)
 *   DELETE /api/documents/{id}                   — delete (needs DELETE)
 *   GET    /api/documents/{id}/preview|download  — needs READ
 *
 * Folder permissions (from FolderDto.permission): READ / WRITE / DELETE.
 * ADMIN bypasses ACL. UI mirrors backend rules; backend remains authoritative.
 *
 * Depends on: jQuery, AuthService, APP_CONFIG, PdfPreview
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
        'text/plain':       { ext: 'txt',  label: 'TXT',  cssClass: 'type-txt'  },
        'image/jpeg':       { ext: 'jpg',  label: 'JPG',  cssClass: 'type-img'  },
        'image/png':        { ext: 'png',  label: 'PNG',  cssClass: 'type-img'  },
        'image/gif':        { ext: 'gif',  label: 'GIF',  cssClass: 'type-img'  },
        'image/webp':       { ext: 'webp', label: 'WEBP', cssClass: 'type-img' }
    };

    var TEXT_PREVIEW_TYPES = ['application/json', 'application/xml', 'text/xml', 'text/plain'];
    var IMAGE_PREVIEW_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    var SUPPORTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'json', 'xml', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    /** Client-side size check aligned with backend default (20 MB). */
    var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
    var PAGE_SIZE = 10;

    // ── State ──────────────────────────────────────────────────────────────

    var state = {
        currentPage:     0,
        totalPages:      0,
        currentFolderId: null,   // null = all, 'root' = root only, number = folder id
        folderTree:      [],
        collapsedFolders: {},   // folderId -> true when the user closed the node
        selectedFile:    null,
        searchQuery:     ''      // active search term
    };

    var perms = {
        isAdmin:       false,
        manageFolders: false   // create / rename / delete folders + ACL UI
    };

    var PERM_RANK = { READ: 1, WRITE: 2, DELETE: 3 };

    var PERM_LABELS = {
        READ:   'Pregled',
        WRITE:  'Izmena',
        DELETE: 'Brisanje'
    };

    var ROLE_LABELS = {
        VIEWER:   'Posmatrač',
        CUSTOMER: 'Klijent',
        ADMIN:    'Administrator'
    };

    function permLabel(level) {
        return PERM_LABELS[level] || level || '';
    }

    function permIconsHtml(level) {
        var label = permLabel(level);
        var iconClass = 'fa-eye';
        var levelClass = 'perm-read';
        if (level === 'DELETE') {
            iconClass = 'fa-trash';
            levelClass = 'perm-delete';
        } else if (level === 'WRITE') {
            iconClass = 'fa-pencil';
            levelClass = 'perm-write';
        }
        return '<span class="doc-tree-perm-badge ' + levelClass + '" title="' + escAttr(label) + '" aria-label="' + escAttr(label) + '">' +
            '<i class="fa ' + iconClass + '" aria-hidden="true"></i>' +
            '</span>';
    }

    function roleLabel(role) {
        return ROLE_LABELS[role] || role || '';
    }

    // ── Init ───────────────────────────────────────────────────────────────

    $(document).ready(function () {
        if (!AuthService.requireAuth()) return;

        AuthService.refreshUser()
            .catch(function () { /* fall back to the stored role */ })
            .then(init);
    });

    function init() {
        perms.isAdmin       = AuthService.isAdmin();
        perms.manageFolders = perms.isAdmin;
        applyPermissions();

        bindModalClose();
        bindPreviewModal();
        bindFilterClear();
        bindDocActionMenus();
        bindUploadZone();
        bindUploadSubmit();
        bindUploadCollapse();
        bindMoveDocModal();
        bindDeleteDocModal();

        if (perms.manageFolders) {
            bindNewFolderModal();
            bindRenameFolderModal();
            bindDeleteFolderModal();
            bindPermissionsModal();

            $('#new-root-folder-btn').on('click', function () {
                openNewFolderModal(null);
            });
        }

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
            updateUploadVisibility();
            loadDocuments(0);
        });

        // Clear search when input is manually cleared
        $('#doc-search-input').on('input', function () {
            if ($.trim($(this).val()) === '' && state.searchQuery !== '') {
                state.searchQuery = '';
                updateFilterBar();
                updateUploadVisibility();
                loadDocuments(0);
            }
        });

        loadFolderTree().then(function () {
            loadDocuments(0);
        });
    }

    function applyPermissions() {
        $('[data-requires="manage-folders"]').toggleClass('hidden', !perms.manageFolders);
        if (!perms.isAdmin) {
            $('#documents-page-subtitle').text('Pregledajte i preuzmite dokumente prema dodeljenim dozvolama.');
        }
        updateUploadVisibility();
    }

    function permissionImplies(have, need) {
        if (perms.isAdmin) return true;
        if (!have || !need) return false;
        return (PERM_RANK[have] || 0) >= (PERM_RANK[need] || 0);
    }

    function folderPermission(folderId) {
        if (folderId == null || folderId === 'all' || folderId === 'root') return null;
        var node = findFolderInTree(state.folderTree, folderId);
        return node && node.permission ? node.permission : null;
    }

    function canWriteInFolder(folderId) {
        return permissionImplies(folderPermission(folderId), 'WRITE');
    }

    function canDeleteInFolder(folderId) {
        return permissionImplies(folderPermission(folderId), 'DELETE');
    }

    function canWriteHere() {
        if (perms.isAdmin) {
            return state.currentFolderId === 'root'
                || typeof state.currentFolderId === 'number';
        }
        return typeof state.currentFolderId === 'number'
            && canWriteInFolder(state.currentFolderId);
    }

    function updateUploadVisibility() {
        var show = false;
        if (perms.isAdmin) {
            show = state.currentFolderId === 'root' || (typeof state.currentFolderId === 'number');
        } else {
            show = typeof state.currentFolderId === 'number' && canWriteInFolder(state.currentFolderId);
        }
        $('#upload-card').toggleClass('hidden', !show);
    }

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
                closeAllDocActionMenus();
                $('.doc-modal-overlay.open').each(function () {
                    closeModal($(this).attr('id'));
                });
            }
        });
    }

    function closeAllDocActionMenus() {
        $('.doc-actions-more.is-open')
            .removeClass('is-open')
            .find('.btn-more-doc').attr('aria-expanded', 'false').end()
            .find('.doc-actions-menu').prop('hidden', true);
        $('.doc-table-wrap').removeClass('has-open-menu');
    }

    function bindDocActionMenus() {
        $(document).on('click.docmenus', function () {
            closeAllDocActionMenus();
        });
        $(document).on('click.docmenus', '.doc-actions-more', function (e) {
            e.stopPropagation();
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
        // Root is ADMIN-only (non-admin users have no access to unfiled documents)
        if (perms.isAdmin) {
            html += buildSpecialNode('root', 'fa-inbox', 'Root (bez foldera)', state.currentFolderId === 'root');
        }

        tree.forEach(function (node) {
            html += buildFolderNode(node, 0);
        });

        $tree.html(html);

        $tree.off('click.tree').on('click.tree', '.doc-tree-row', function (e) {
            if ($(e.target).closest('.doc-tree-actions').length) return;
            if ($(e.target).closest('.doc-tree-toggle').length) return;

            var $row = $(this);
            var fid  = $row.data('folder-id');

            if (fid === 'all')  state.currentFolderId = null;
            else if (fid === 'root') state.currentFolderId = 'root';
            else state.currentFolderId = parseInt(fid, 10);

            state.searchQuery = '';
            $('#doc-search-input').val('');

            $tree.find('.doc-tree-row').removeClass('active');
            $row.addClass('active');

            updateFilterBar();
            updateUploadVisibility();
            loadDocuments(0);
        });

        $tree.on('click.toggle', '.doc-tree-toggle', function (e) {
            e.stopPropagation();
            var $btn      = $(this);
            var $li       = $btn.closest('li');
            var $row      = $li.find('> .doc-tree-row').first();
            var $children = $li.find('> .doc-tree-children').first();
            var $icon     = $row.find('> .doc-tree-icon').first();
            var fid       = parseInt($row.data('folder-id'), 10);
            var willOpen  = !$btn.hasClass('open');

            $btn.toggleClass('open', willOpen);
            $children.toggleClass('open', willOpen);
            $li.toggleClass('is-open', willOpen);
            $row.attr('aria-expanded', willOpen ? 'true' : 'false');
            $icon.toggleClass('fa-folder-open', willOpen).toggleClass('fa-folder', !willOpen);

            if (!isNaN(fid)) {
                if (willOpen) delete state.collapsedFolders[fid];
                else state.collapsedFolders[fid] = true;
            }
        });

        $tree.on('click.actions', '.doc-tree-action-btn', function (e) {
            e.stopPropagation();
            var action = $(this).data('action');
            var fid    = parseInt($(this).data('id'), 10);
            var name   = $(this).data('name');

            if (action === 'new-sub' && perms.manageFolders)  openNewFolderModal(fid);
            if (action === 'rename'  && perms.manageFolders)  openRenameFolderModal(fid, name);
            if (action === 'delete'  && perms.manageFolders) openDeleteFolderModal(fid, name);
            if (action === 'permissions' && perms.manageFolders) openPermissionsModal(fid, name);
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
        var isOpen      = hasChildren && !state.collapsedFolders[node.id];

        var html = '<li class="doc-tree-node' + (hasChildren ? ' has-children' : '') + (isOpen ? ' is-open' : '') + '">';
        html += '<div class="doc-tree-row' + (isActive ? ' active' : '') + '" data-folder-id="' + node.id + '" role="treeitem"' +
            (hasChildren ? ' aria-expanded="' + (isOpen ? 'true' : 'false') + '"' : '') + '>';

        // Collapse toggle or spacer
        if (hasChildren) {
            html += '<button type="button" class="doc-tree-toggle' + (isOpen ? ' open' : '') + '" title="Razvij/skupi" aria-label="Razvij ili skupi podfoldere"><i class="fa fa-caret-right"></i></button>';
        } else {
            html += '<span class="doc-tree-toggle-spacer" aria-hidden="true"></span>';
        }

        html += '<i class="fa fa-folder' + (isOpen ? '-open' : '') + ' doc-tree-icon" aria-hidden="true"></i>';
        html += '<span class="doc-tree-label">' + escHtml(node.name) + '</span>';

        if (perms.manageFolders) {
            html += '<div class="doc-tree-actions">';
            html += '<button type="button" class="doc-tree-action-btn" data-action="permissions" data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Dozvole"><i class="fa fa-lock"></i></button>';
            html += '<button type="button" class="doc-tree-action-btn" data-action="new-sub" data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Novi podfolder"><i class="fa fa-folder-o"></i></button>';
            html += '<button type="button" class="doc-tree-action-btn" data-action="rename"  data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Preimenuj"><i class="fa fa-pencil"></i></button>';
            html += '<button type="button" class="doc-tree-action-btn danger" data-action="delete" data-id="' + node.id + '" data-name="' + escAttr(node.name) + '" title="Obriši"><i class="fa fa-trash"></i></button>';
            html += '</div>';
        } else if (node.permission) {
            html += permIconsHtml(node.permission);
        }

        html += '</div>'; // .doc-tree-row

        // Children are visible until the user collapses the folder
        if (hasChildren) {
            html += '<ul class="doc-tree-children' + (isOpen ? ' open' : '') + '" role="group">';
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
            updateUploadVisibility();
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
                if (parentId != null) delete state.collapsedFolders[parentId];
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
        populateMoveSelect(state.folderTree);
        openModal('modal-move-doc');
    }

    // ══════════════════════════════════════════════════════════════════════
    // DELETE DOCUMENT MODAL
    // ══════════════════════════════════════════════════════════════════════

    function bindDeleteDocModal() {
        $('#delete-doc-confirm-btn').on('click', function () {
            var $btn  = $(this);
            var docId = $btn.data('doc-id');

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Brisanje...');

            AuthService.authFetch('/api/documents/' + docId, { method: 'DELETE' })
                .then(function () {
                    closeModal('modal-delete-doc');
                    // Step back a page if we just removed the last item on it
                    var onlyRowLeft = $('#doc-list-container tr').not('.doc-table-message').length <= 1;
                    var page = (onlyRowLeft && state.currentPage > 0) ? state.currentPage - 1 : state.currentPage;
                    loadDocuments(page);
                })
                .catch(function (err) {
                    closeModal('modal-delete-doc');
                    showUploadAlert(err.message || 'Greška pri brisanju dokumenta.', 'error');
                })
                .finally(function () {
                    $btn.prop('disabled', false).html('<i class="fa fa-trash"></i> Obriši');
                });
        });
    }

    function openDeleteDocModal(docId, docName) {
        $('#delete-doc-confirm-btn').data('doc-id', docId);
        $('#delete-doc-name-label').text('"' + docName + '"');
        openModal('modal-delete-doc');
    }

    function populateMoveSelect(tree) {
        var html = '';
        if (perms.isAdmin) {
            html += '<option value="">— Root (bez foldera) —</option>';
        }
        html += buildSelectOptions(tree, 0);
        if (!html) {
            html = '<option value="" disabled>Nema foldera sa dozvolom za izmenu</option>';
        }
        $('#move-doc-folder-select').html(html);
    }

    function buildSelectOptions(nodes, depth) {
        var html = '';
        nodes.forEach(function (node) {
            if (perms.isAdmin || canWriteInFolder(node.id)) {
                var prefix = '\u00a0'.repeat(depth * 3);
                html += '<option value="' + node.id + '">' + prefix + escHtml(node.name) + '</option>';
            }
            if (node.children && node.children.length) {
                html += buildSelectOptions(node.children, depth + 1);
            }
        });
        return html;
    }

    // ══════════════════════════════════════════════════════════════════════
    // UPLOAD
    // ══════════════════════════════════════════════════════════════════════

    var UPLOAD_COLLAPSED_KEY = 'docs-upload-collapsed';

    function setUploadCollapsed(collapsed) {
        var $card = $('#upload-card');
        var $toggle = $('#upload-card-toggle');
        $card.toggleClass('is-collapsed', collapsed);
        $toggle.attr('aria-expanded', collapsed ? 'false' : 'true');
        try {
            localStorage.setItem(UPLOAD_COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch (e) { /* ignore quota / private mode */ }
    }

    function bindUploadCollapse() {
        var collapsed = false;
        try {
            collapsed = localStorage.getItem(UPLOAD_COLLAPSED_KEY) === '1';
        } catch (e) { /* ignore */ }
        setUploadCollapsed(collapsed);

        $('#upload-card-toggle').on('click', function () {
            setUploadCollapsed(!$('#upload-card').hasClass('is-collapsed'));
        });
    }

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
            showUploadAlert('Nepodržan format fajla. Dozvoljeni: PDF, DOC, DOCX, JSON, XML, TXT, JPG, PNG, GIF, WEBP.', 'error');
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            showUploadAlert('Fajl je prevelik. Maksimalna veličina je 20 MB.', 'error');
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
        $('.doc-table-wrap').removeClass('is-empty');
        $('#doc-list-container').html(
            '<tr class="doc-table-message"><td colspan="4"><div class="doc-spinner">' +
            '<i class="fa fa-spinner fa-spin"></i>Učitavanje...</div></td></tr>'
        );
        $('#doc-pagination').html('');
    }

    function showListError(msg) {
        $('.doc-table-wrap').addClass('is-empty');
        $('#doc-list-container').html(
            '<tr class="doc-table-message"><td colspan="4"><div class="doc-empty-state is-error">' +
            '<div class="doc-empty-icon"><i class="fa fa-exclamation-circle"></i></div>' +
            '<h4 class="doc-empty-title">Nešto nije u redu</h4>' +
            '<p class="doc-empty-text">' + escHtml(msg) + '</p></div></td></tr>'
        );
    }

    function buildEmptyStateHtml() {
        var icon  = 'fa-file-o';
        var title = 'Još nema dokumenata';
        var text  = 'Otpremite prvi fajl da se pojavi u listi.';
        var actions = '';

        if (state.searchQuery) {
            icon  = 'fa-search';
            title = 'Nema rezultata';
            text  = 'Nijedan dokument ne odgovara pretrazi „' + escHtml(state.searchQuery) + '“.';
            actions =
                '<button type="button" class="btn-secondary-doc" id="doc-empty-clear-search">' +
                '<i class="fa fa-times"></i> Obriši pretragu</button>';
        } else if (state.currentFolderId === 'root') {
            icon  = 'fa-inbox';
            title = 'Root je prazan';
            text  = 'Nema dokumenata van foldera. Premestite fajl ovde ili otpremite novi.';
        } else if (state.currentFolderId != null) {
            var folderName = (findFolderInTree(state.folderTree, state.currentFolderId) || {}).name || 'Folder';
            icon  = 'fa-folder-open-o';
            title = 'Ovaj folder je prazan';
            text  = 'U folderu „' + escHtml(folderName) + '“ još nema dokumenata.';
            actions =
                '<button type="button" class="btn-secondary-doc" id="doc-empty-clear-filter">' +
                '<i class="fa fa-th-list"></i> Prikaži sve</button>';
        }

        if (canWriteHere() && !state.searchQuery) {
            actions =
                '<button type="button" class="btn-primary-doc" id="doc-empty-upload-btn">' +
                '<i class="fa fa-upload"></i> Otpremi dokument</button>' +
                actions;
        }

        return '<div class="doc-empty-state">' +
            '<div class="doc-empty-icon"><i class="fa ' + icon + '"></i></div>' +
            '<h4 class="doc-empty-title">' + title + '</h4>' +
            '<p class="doc-empty-text">' + text + '</p>' +
            (actions ? '<div class="doc-empty-actions">' + actions + '</div>' : '') +
            '</div>';
    }

    function bindEmptyStateActions() {
        $('#doc-empty-upload-btn').on('click', function () {
            var $card = $('#upload-card');
            if ($card.length && !$card.hasClass('hidden')) {
                $('html, body').animate({ scrollTop: $card.offset().top - 80 }, 280);
                setTimeout(function () {
                    $('#upload-file-input').trigger('click');
                }, 300);
            }
        });
        $('#doc-empty-clear-filter').on('click', function () {
            $('#doc-filter-clear').trigger('click');
        });
        $('#doc-empty-clear-search').on('click', function () {
            state.searchQuery = '';
            $('#doc-search-input').val('');
            $('#doc-filter-bar').hide();
            loadDocuments(0);
        });
    }

    function renderDocuments(docs) {
        if (!docs || docs.length === 0) {
            $('.doc-table-wrap').addClass('is-empty');
            $('#doc-list-container').html(
                '<tr class="doc-table-message"><td colspan="4">' + buildEmptyStateHtml() + '</td></tr>'
            );
            bindEmptyStateActions();
            return;
        }

        $('.doc-table-wrap').removeClass('is-empty');

        var rows = docs.map(function (doc) {
            var typeInfo = getTypeInfo(doc.contentType, doc.fileName);
            var dateStr  = formatDate(doc.createdAt);
            var sizeStr  = doc.size != null ? formatBytes(doc.size) : '—';
            var id       = escAttr(String(doc.id));
            var name     = escAttr(doc.fileName);
            var mime     = escAttr(doc.contentType || '');

            var previewBtn = isWordType(doc.contentType, doc.fileName) ? '' :
                '<button type="button" class="btn-icon-doc btn-preview-doc" data-id="' + id + '" ' +
                'data-name="' + name + '" data-type="' + mime + '" title="Pregled">' +
                '<i class="fa fa-eye"></i><span>Pregled</span></button>';

            var menuItems = '';
            var docFolderId = doc.folderId;
            var canMove = perms.isAdmin
                || (docFolderId != null && canDeleteInFolder(docFolderId));
            var canDel = perms.isAdmin
                || (docFolderId != null && canDeleteInFolder(docFolderId));

            if (canMove) {
                menuItems +=
                    '<button type="button" class="doc-actions-menu-item btn-move-doc" role="menuitem" ' +
                    'data-id="' + id + '" data-name="' + name + '">' +
                    '<i class="fa fa-share"></i><span>Premesti</span></button>';
            }
            if (canDel) {
                menuItems +=
                    '<button type="button" class="doc-actions-menu-item btn-delete-doc" role="menuitem" ' +
                    'data-id="' + id + '" data-name="' + name + '">' +
                    '<i class="fa fa-trash"></i><span>Obriši</span></button>';
            }

            var moreMenu = !menuItems ? '' :
                '<div class="doc-actions-more">' +
                '  <button type="button" class="btn-icon-doc btn-more-doc" title="Više opcija" ' +
                'aria-haspopup="true" aria-expanded="false">' +
                '    <i class="fa fa-ellipsis-v"></i><span class="sr-only">Više</span>' +
                '  </button>' +
                '  <div class="doc-actions-menu" role="menu" hidden>' +
                menuItems +
                '  </div>' +
                '</div>';

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
                '  <button type="button" class="btn-icon-doc btn-download-doc" data-id="' + id + '" data-name="' + name + '" title="Preuzmi">',
                '    <i class="fa fa-download"></i><span>Preuzmi</span>',
                '  </button>',
                moreMenu,
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
            .on('click.docactions', '.btn-more-doc', function (e) {
                e.stopPropagation();
                var $wrap = $(this).closest('.doc-actions-more');
                var wasOpen = $wrap.hasClass('is-open');
                closeAllDocActionMenus();
                if (!wasOpen) {
                    $wrap.addClass('is-open');
                    $wrap.find('.doc-actions-menu').prop('hidden', false);
                    $(this).attr('aria-expanded', 'true');
                    $wrap.closest('.doc-table-wrap').addClass('has-open-menu');
                }
            })
            .on('click.docactions', '.btn-move-doc', function () {
                closeAllDocActionMenus();
                openMoveDocModal($(this).data('id'), $(this).data('name'));
            })
            .on('click.docactions', '.btn-delete-doc', function () {
                closeAllDocActionMenus();
                openDeleteDocModal($(this).data('id'), $(this).data('name'));
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
        } else if (IMAGE_PREVIEW_TYPES.indexOf(mimeType) !== -1) {
            loadImagePreview($body, id, fileName);
        } else {
            $body.html('<div class="doc-preview-error"><i class="fa fa-ban"></i>' +
                '<p>Pregled nije dostupan za ovaj tip fajla.</p></div>');
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

    function closePreview() {
        var $body = $('#doc-preview-body');
        PdfPreview.cleanup($body);
        revokeImagePreviewUrl($body);
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
        // Some browsers report image/jpg
        if (file.type === 'image/jpg') return true;
        var ext = getExtension(file.name).toLowerCase();
        return SUPPORTED_EXTENSIONS.indexOf(ext) !== -1;
    }

    function isWordType(mimeType, fileName) {
        if (mimeType === 'application/msword') return true;
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
        var ext = getExtension(fileName || '').toLowerCase();
        return ext === 'doc' || ext === 'docx';
    }

    function getTypeInfo(mimeType, fileName) {
        if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
        if (SUPPORTED_TYPES[mimeType]) return SUPPORTED_TYPES[mimeType];
        var ext = getExtension(fileName || '').toLowerCase();
        var byExt = {
            pdf:  { ext: 'pdf',  label: 'PDF',  cssClass: 'type-pdf'  },
            doc:  { ext: 'doc',  label: 'DOC',  cssClass: 'type-doc'  },
            docx: { ext: 'docx', label: 'DOCX', cssClass: 'type-docx' },
            json: { ext: 'json', label: 'JSON', cssClass: 'type-json' },
            xml:  { ext: 'xml',  label: 'XML',  cssClass: 'type-xml'  },
            txt:  { ext: 'txt',  label: 'TXT',  cssClass: 'type-txt'  },
            jpg:  { ext: 'jpg',  label: 'JPG',  cssClass: 'type-img'  },
            jpeg: { ext: 'jpeg', label: 'JPG',  cssClass: 'type-img'  },
            png:  { ext: 'png',  label: 'PNG',  cssClass: 'type-img'  },
            gif:  { ext: 'gif',  label: 'GIF',  cssClass: 'type-img'  },
            webp: { ext: 'webp', label: 'WEBP', cssClass: 'type-img'  }
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

    // ══════════════════════════════════════════════════════════════════════
    // FOLDER PERMISSIONS MODAL (ADMIN)
    // ══════════════════════════════════════════════════════════════════════

    var permState = {
        folderId: null,
        grants:   []   // { principalType, userId, userEmail, role, permission }
    };

    function bindPermissionsModal() {
        $('#perm-add-btn').on('click', function () {
            var type = $('#perm-principal-type').val();
            var level = $('#perm-level').val();
            var grant;

            if (type === 'ROLE') {
                var role = $('#perm-role').val();
                if (!role) return;
                if (permState.grants.some(function (g) {
                    return g.principalType === 'ROLE' && g.role === role;
                })) {
                    showPermAlert('Dozvola za ulogu „' + roleLabel(role) + '“ već postoji.', 'error');
                    return;
                }
                grant = { principalType: 'ROLE', role: role, userId: null, userEmail: null, permission: level };
            } else {
                var userId = parseInt($('#perm-user-select').val(), 10);
                var userEmail = $('#perm-user-select option:selected').text();
                if (!userId) {
                    showPermAlert('Izaberite korisnika.', 'error');
                    return;
                }
                if (permState.grants.some(function (g) {
                    return g.principalType === 'USER' && g.userId === userId;
                })) {
                    showPermAlert('Dozvola za ovog korisnika već postoji.', 'error');
                    return;
                }
                grant = {
                    principalType: 'USER',
                    userId: userId,
                    userEmail: userEmail,
                    role: null,
                    permission: level
                };
            }
            permState.grants.push(grant);
            renderPermGrants();
            hidePermAlert();
        });

        $('#perm-principal-type').on('change', function () {
            var isRole = $(this).val() === 'ROLE';
            $('#perm-role-wrap').toggle(isRole);
            $('#perm-user-wrap').toggle(!isRole);
        });

        $('#perm-save-btn').on('click', function () {
            var $btn = $(this);
            var payload = {
                permissions: permState.grants.map(function (g) {
                    return {
                        principalType: g.principalType,
                        userId: g.principalType === 'USER' ? g.userId : null,
                        role: g.principalType === 'ROLE' ? g.role : null,
                        permission: g.permission
                    };
                })
            };

            $btn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Čuvanje...');

            AuthService.authFetch('/api/folders/' + permState.folderId + '/permissions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function () {
                closeModal('modal-folder-permissions');
                showUploadAlert('Dozvole za folder su sačuvane.', 'success');
                return loadFolderTree();
            }).catch(function (err) {
                showPermAlert(err.message || 'Greška pri čuvanju dozvola.', 'error');
            }).finally(function () {
                $btn.prop('disabled', false).html('<i class="fa fa-check"></i> Sačuvaj');
            });
        });

        $('#perm-grants-list').on('click', '.perm-remove-btn', function () {
            var idx = parseInt($(this).data('idx'), 10);
            permState.grants.splice(idx, 1);
            renderPermGrants();
        });

        $('#perm-grants-list').on('change', '.perm-level-select', function () {
            var idx = parseInt($(this).data('idx'), 10);
            permState.grants[idx].permission = $(this).val();
        });
    }

    function openPermissionsModal(folderId, folderName) {
        permState.folderId = folderId;
        permState.grants = [];
        hidePermAlert();
        $('#perm-folder-name-label').text(folderName);
        $('#perm-grants-list').html('<div class="doc-spinner"><i class="fa fa-spinner fa-spin"></i> Učitavanje...</div>');
        $('#perm-principal-type').val('ROLE').trigger('change');
        $('#perm-level').val('READ');
        openModal('modal-folder-permissions');

        Promise.all([
            AuthService.authFetch('/api/folders/' + folderId + '/permissions'),
            AuthService.authFetch('/api/admin/users?page=0&size=100')
        ]).then(function (results) {
            var grants = results[0] || [];
            var usersPage = results[1] || {};
            var users = usersPage.content || [];

            permState.grants = grants.map(function (g) {
                return {
                    principalType: g.principalType,
                    userId: g.userId,
                    userEmail: g.userEmail || (g.userDisplayName || ''),
                    role: g.role,
                    permission: g.permission
                };
            });

            var userOpts = users
                .filter(function (u) { return u.role !== 'ADMIN'; })
                .map(function (u) {
                    return '<option value="' + u.id + '">' +
                        escHtml(u.email) + ' (' + escHtml(roleLabel(u.role)) + ')</option>';
                }).join('');
            $('#perm-user-select').html('<option value="">— Izaberite korisnika —</option>' + userOpts);

            renderPermGrants();
        }).catch(function (err) {
            showPermAlert(err.message || 'Greška pri učitavanju dozvola.', 'error');
            $('#perm-grants-list').html('');
        });
    }

    function renderPermGrants() {
        if (!permState.grants.length) {
            $('#perm-grants-list').html(
                '<div class="perm-empty">Nema dodeljenih dozvola — samo administrator može pristupiti ovom folderu.</div>'
            );
            return;
        }

        var html = '<table class="perm-table"><thead><tr>' +
            '<th>Dodeljeno</th><th>Nivo</th><th class="perm-col-actions"></th></tr></thead><tbody>';

        permState.grants.forEach(function (g, idx) {
            var kind = g.principalType === 'ROLE' ? 'Uloga' : 'Korisnik';
            var value = g.principalType === 'ROLE'
                ? escHtml(roleLabel(g.role))
                : escHtml(g.userEmail || ('#' + g.userId));
            html += '<tr>' +
                '<td><span class="perm-principal"><span class="perm-principal-kind">' + kind +
                '</span><strong>' + value + '</strong></span></td>' +
                '<td><select class="perm-level-select" data-idx="' + idx + '">' +
                '<option value="READ"' + (g.permission === 'READ' ? ' selected' : '') + '>' + permLabel('READ') + '</option>' +
                '<option value="WRITE"' + (g.permission === 'WRITE' ? ' selected' : '') + '>' + permLabel('WRITE') + '</option>' +
                '<option value="DELETE"' + (g.permission === 'DELETE' ? ' selected' : '') + '>' + permLabel('DELETE') + '</option>' +
                '</select></td>' +
                '<td class="perm-col-actions"><button type="button" class="perm-remove-btn" data-idx="' + idx + '" title="Ukloni" aria-label="Ukloni dozvolu">' +
                '<i class="fa fa-times"></i></button></td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        $('#perm-grants-list').html(html);
    }

    function showPermAlert(msg, type) {
        $('#perm-alert').removeClass('error success info').addClass(type || 'error')
            .html(msg).show();
    }

    function hidePermAlert() {
        $('#perm-alert').hide().removeClass('error success info');
    }

})(jQuery);
