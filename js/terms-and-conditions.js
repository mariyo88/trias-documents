(function ($) {
	'use strict';

	$(document).ready(function () {
		// Smooth scroll to sections
		$('.smooth-scroll').on('click', function (e) {
			e.preventDefault();
			var target = $(this).attr('href');
			if ($(target).length) {
				$('html, body').animate({
					scrollTop: $(target).offset().top - 100
				}, 800);
			}
		});

		// Highlight active section in sidebar
		$(window).on('scroll', function () {
			var scrollPos = $(window).scrollTop() + 150;
			$('.terms-article').each(function () {
				var currLink = $(this);
				var refElement = currLink;
				if (refElement.position().top <= scrollPos && refElement.position().top + refElement.height() > scrollPos) {
					$('.terms-nav a').removeClass('active');
					$('.terms-nav a[href="#' + currLink.attr('id') + '"]').addClass('active');
				}
			});
		});
	});

})(jQuery);
