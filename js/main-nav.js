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
            navItem('index.html',      'Početna')   +
            navItem('documents.html',  'Dokumenti') +
            navItem('about.html',      'O nama')    +
            navItem('contact.html',    'Kontakt')   +
            navItem('help.html',       'Pomoć');

        if (isAdmin()) {
            navHtml += navItem('admin-users.html', 'Korisnici');
        }

        $('.main-nav').html(navHtml);
    }

    function isAdmin() {
        var auth = window.AuthService;
        return !!auth && auth.isLoggedIn() && auth.hasRole(auth.ROLES.ADMIN);
    }

    $(document).ready(function () {
        // Fix logo href
        $('.header-logo a.logo').attr('href', 'index.html');
        initNav();
    });

})(jQuery);
