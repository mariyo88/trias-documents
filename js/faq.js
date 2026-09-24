/**
 * FAQ Page - Interactive accordion and category navigation
 */
(function ($) {
    'use strict';

    // Toggle FAQ item (accordion)
    $(document).on('click', '.faq-question', function() {
        var $item = $(this).closest('.faq-item');
        
        // Close other items in the same category
        $item.siblings('.faq-item').removeClass('active');
        
        // Toggle current item
        $item.toggleClass('active');
    });

    // Category navigation
    $(document).on('click', '.faq-category-link', function(e) {
        e.preventDefault();
        
        var target = $(this).attr('href');
        
        // Update active state
        $('.faq-category-link').removeClass('active');
        $(this).addClass('active');
        
        // Smooth scroll to category
        if (target && target !== '#') {
            $('html, body').animate({
                scrollTop: $(target).offset().top - 100
            }, 500);
        }
    });

    // Auto-activate first category on load
    $(document).ready(function() {
        if ($('.faq-category-link').length > 0) {
            $('.faq-category-link').first().addClass('active');
        }
    });

})(jQuery);
