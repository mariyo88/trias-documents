/**
 * Main Navigation — document platform
 */
(function ($) {
    'use strict';

    function initNav() {
        var currentPage = window.location.pathname.split('/').pop() || 'index.html';

        function navItem(href, label) {
            var isActive = href === currentPage || (currentPage === '' && href === 'index.html');
            return '<li' + (isActive ? ' class="active"' : '') + '><a href="' + href + '">' + label + '</a></li>';
        }

        var navHtml =
            navItem('index.html',   'Dokumenti') +
            navItem('about.html',   'O nama')    +
            navItem('contact.html', 'Kontakt')   +
            navItem('help.html',    'Pomoć');

        $('.main-nav').html(navHtml);
    }

    $(document).ready(function () {
        // Fix logo href
        $('.header-logo a.logo').attr('href', 'index.html');
        initNav();
    });

})(jQuery);
