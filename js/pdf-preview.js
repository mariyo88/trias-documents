/**
 * PdfPreview — shared PDF preview renderer for documents / my-documents.
 *
 * Desktop browsers with a built-in PDF viewer: native <iframe> + blob URL.
 * Mobile browsers (no reliable inline PDF): Mozilla PDF.js canvas rendering.
 *
 * Auth stays on the caller (authenticated fetch → blob). This module never
 * exposes unauthenticated PDF URLs.
 */
(function (window) {
    'use strict';

    var PDFJS_VERSION = '3.11.174';
    var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
    var pdfJsLoadPromise = null;

    /**
     * Mobile browsers do not reliably render PDFs inside iframes/embeds
     * (blank white viewer + non-functional "Open" button). Detect that case.
     */
    function canUseNativePdfEmbed() {
        var ua = navigator.userAgent || '';
        if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
        // iPadOS 13+ may report as Macintosh
        if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return false;
        if (typeof navigator.pdfViewerEnabled === 'boolean') {
            return navigator.pdfViewerEnabled;
        }
        return true;
    }

    function ensurePdfJs() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        if (pdfJsLoadPromise) return pdfJsLoadPromise;

        pdfJsLoadPromise = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = PDFJS_CDN + 'pdf.min.js';
            script.async = true;
            script.onload = function () {
                if (!window.pdfjsLib) {
                    reject(new Error('PDF.js nije učitan.'));
                    return;
                }
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = function () {
                pdfJsLoadPromise = null;
                reject(new Error('Nije moguće učitati PDF pregledač.'));
            };
            document.head.appendChild(script);
        });

        return pdfJsLoadPromise;
    }

    function toPdfBlob(blob) {
        if (blob && blob.type === 'application/pdf') return blob;
        return new Blob([blob], { type: 'application/pdf' });
    }

    function renderNativeIframe($body, blob, fileName) {
        var pdfBlob = toPdfBlob(blob);
        var url = URL.createObjectURL(pdfBlob);
        $body.data('blobUrl', url);
        $body.data('pdfMode', 'iframe');
        $body.html(
            '<iframe src="' + escAttr(url) + '" title="' + escAttr(fileName || 'PDF') + '"></iframe>'
        );
        return Promise.resolve();
    }

    function renderWithPdfJs($body, blob, fileName) {
        var pdfBlob = toPdfBlob(blob);
        $body.data('pdfMode', 'pdfjs');

        return ensurePdfJs()
            .then(function (pdfjsLib) {
                return pdfBlob.arrayBuffer().then(function (data) {
                    return pdfjsLib.getDocument({ data: data }).promise;
                });
            })
            .then(function (pdf) {
                $body.data('pdfDocument', pdf);

                var $scroll = $('<div class="doc-preview-pdfjs" role="document"></div>');
                $scroll.attr('aria-label', fileName || 'PDF pregled');
                $body.empty().append($scroll);

                var containerWidth = Math.max(($scroll[0].clientWidth || $body[0].clientWidth || 320) - 16, 280);
                var outputScale = Math.min(window.devicePixelRatio || 1, 2);
                var chain = Promise.resolve();

                for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    (function (num) {
                        chain = chain.then(function () {
                            return pdf.getPage(num).then(function (page) {
                                var baseViewport = page.getViewport({ scale: 1 });
                                var scale = containerWidth / baseViewport.width;
                                var viewport = page.getViewport({ scale: scale });

                                var canvas = document.createElement('canvas');
                                canvas.className = 'pdf-page';
                                canvas.setAttribute('aria-label', 'Stranica ' + num);
                                canvas.width = Math.floor(viewport.width * outputScale);
                                canvas.height = Math.floor(viewport.height * outputScale);
                                canvas.style.width = Math.floor(viewport.width) + 'px';
                                canvas.style.height = Math.floor(viewport.height) + 'px';

                                var ctx = canvas.getContext('2d');
                                var transform = outputScale !== 1
                                    ? [outputScale, 0, 0, outputScale, 0, 0]
                                    : null;

                                $scroll.append(canvas);

                                return page.render({
                                    canvasContext: ctx,
                                    viewport: viewport,
                                    transform: transform
                                }).promise;
                            });
                        });
                    })(pageNum);
                }

                return chain;
            });
    }

    /**
     * Render a PDF blob into the preview body element.
     * @param {jQuery} $body
     * @param {Blob} blob
     * @param {string} [fileName]
     * @returns {Promise}
     */
    function render($body, blob, fileName) {
        cleanup($body);
        // Route through the public API so callers/tests can override detection.
        if (api.canUseNativePdfEmbed()) {
            return renderNativeIframe($body, blob, fileName);
        }
        return renderWithPdfJs($body, blob, fileName);
    }

    /**
     * Release blob URLs and PDF.js document handles.
     * @param {jQuery} $body
     */
    function cleanup($body) {
        if (!$body || !$body.length) return;

        var pdfDoc = $body.data('pdfDocument');
        if (pdfDoc && typeof pdfDoc.destroy === 'function') {
            try { pdfDoc.destroy(); } catch (e) { /* ignore */ }
        }
        $body.removeData('pdfDocument');

        var blobUrl = $body.data('blobUrl');
        if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            $body.removeData('blobUrl');
        }
        $body.removeData('pdfMode');
    }

    function escAttr(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    var api = {
        render: render,
        cleanup: cleanup,
        canUseNativePdfEmbed: canUseNativePdfEmbed
    };

    window.PdfPreview = api;
})(window);
