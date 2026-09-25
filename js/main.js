// Global price formatting function
function formatPrice(val) {
	if (val == null) return '—';
	return Number(val).toLocaleString('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RSD';
}

// ─── Auth header integration ──────────────────────────────────────────────────
// Runs on every page that includes main.js. Updates #nav-account-link based on
// login state. AuthService is loaded via auth.js which must be included before
// main.js in the page.

(function () {
    function initAuthHeader() {
        var $link  = $('#nav-account-link');
        var $label = $('#nav-account-label');
        if (!$link.length) return;

        // Update all static footer "Moj nalog" links based on login state
        var $footerAccountLinks = $('footer a.footer-account-link');

        if (typeof window.AuthService === 'undefined' || !window.AuthService.isLoggedIn()) {
            // Not logged in — link to login page (already set as default href)
            $link.attr('href', 'login.html');
            $label.text('Moj nalog');
            $footerAccountLinks.attr('href', 'login.html');
            return;
        }

        // Logged in — footer links go to account
        $footerAccountLinks.attr('href', 'account.html');

        // Logged in — show first name and account link, add logout option
        var user = window.AuthService.getUser();
        var firstName = user && user.firstName ? user.firstName : 'Nalog';
        var lastName = user && user.lastName ? user.lastName : '';
        var displayName = lastName ? firstName + ' ' + lastName : firstName;
        $link.attr('href', 'account.html');
        $label.html(displayName + ' <span class="auth-caret">&#9660;</span>');

        // Wrap in a mini-dropdown if not already done
        if (!$link.hasClass('auth-dropdown-init')) {
            $link.addClass('auth-dropdown-init');

            // Ensure the anchor's parent has position:relative for dropdown positioning
            var $anchor = $link.parent();
            if ($anchor.css('position') === 'static') {
                $anchor.css('position', 'relative');
            }

            var isAdmin = window.AuthService.hasRole(window.AuthService.ROLES.ADMIN);
            var $dropdown = $([
                '<ul class="auth-user-dropdown">',
                '  <li><a href="account.html"><i class="fa fa-user"></i>Moj profil</a></li>',
                isAdmin ? '  <li><a href="admin-users.html"><i class="fa fa-users"></i>Korisnici</a></li>' : '',
                '  <li><a href="#" id="nav-logout-btn"><i class="fa fa-sign-out"></i>Odjavi se</a></li>',
                '</ul>'
            ].join(''));

            $anchor.append($dropdown);

            // Toggle dropdown on link click
            $link.on('click', function (e) {
                e.preventDefault();
                $dropdown.toggle();
            });

            // Close on outside click
            $(document).on('click.authdropdown', function (e) {
                if (!$anchor.is(e.target) && !$anchor.has(e.target).length) {
                    $dropdown.hide();
                }
            });

            // Logout
            $dropdown.on('click', '#nav-logout-btn', function (e) {
                e.preventDefault();
                window.AuthService.logout().then(function () {
                    window.location.href = 'index.html';
                });
            });
        }
    }

    // Run after DOM ready — AuthService must be available by then
    document.addEventListener('DOMContentLoaded', initAuthHeader);
})();

(function($) {
	"use strict"

	// Mobile Nav toggle
	$('.menu-toggle > a').on('click', function (e) {
		e.preventDefault();
		$('#responsive-nav').toggleClass('active');
	})

	// Mobile Store Filter drawer toggle
	var _scrollY = 0;

	function openFilterDrawer() {
		_scrollY = window.scrollY || window.pageYOffset;
		$('#aside').addClass('filter-open');
		$('#filter-backdrop').addClass('active');
		// Koristimo klasu na html elementu — ne diramo body position
		// (body position:fixed kvari position:sticky na header-u)
		$('html').addClass('filter-drawer-open');
		$('html').css('--scroll-y', '-' + _scrollY + 'px');
	}

	function closeFilterDrawer() {
		$('#aside').removeClass('filter-open');
		$('#filter-backdrop').removeClass('active');
		$('html').removeClass('filter-drawer-open');
		$('html').css('--scroll-y', '');
		window.scrollTo(0, _scrollY);
	}

	$('#mobile-filter-toggle').on('click', function () {
		openFilterDrawer();
	});

	$('#filter-close-btn').on('click', function () {
		closeFilterDrawer();
	});

	$('#filter-backdrop').on('click', function () {
		closeFilterDrawer();
	});

	// Zatvori drawer na ESC
	$(document).on('keydown', function (e) {
		if (e.key === 'Escape') {
			closeFilterDrawer();
		}
	});

	// Mobile Search toggle
	$('.search-toggle-btn').on('click', function (e) {
		e.preventDefault();
		var $searchCol = $('#header .col-md-6');
		var $icon = $(this).find('i');
		var isOpen = $searchCol.hasClass('search-open');

		$searchCol.toggleClass('search-open');
		$(this).toggleClass('active');

		if (!isOpen) {
			// Fokusiraj input kad se otvori
			setTimeout(function () {
				$searchCol.find('.input').focus();
			}, 320);
		}
	})

	// Zatvori search bar klikom van headera
	$(document).on('click', function (e) {
		if (!$(e.target).closest('header').length) {
			$('#header .col-md-6').removeClass('search-open');
			$('.search-toggle-btn').removeClass('active');
		}
	})

	/////////////////////////////////////////

	// Products Slick
	$('.products-slick').each(function() {
		var $this = $(this),
				$nav = $this.attr('data-nav');

		$this.slick({
			slidesToShow: 4,
			slidesToScroll: 1,
			autoplay: true,
			infinite: true,
			speed: 300,
			dots: false,
			arrows: true,
			appendArrows: $nav ? $nav : false,
			responsive: [{
	        breakpoint: 991,
	        settings: {
	          slidesToShow: 2,
	          slidesToScroll: 1,
	        }
	      },
	      {
	        breakpoint: 480,
	        settings: {
	          slidesToShow: 1,
	          slidesToScroll: 1,
	        }
	      },
	    ]
		});
	});

	// Products Widget Slick
	$('.products-widget-slick').each(function() {
		var $this = $(this),
				$nav = $this.attr('data-nav');

		$this.slick({
			infinite: true,
			autoplay: true,
			speed: 300,
			dots: false,
			arrows: true,
			appendArrows: $nav ? $nav : false,
		});
	});

	/////////////////////////////////////////

	// Product Main img Slick — only init if product-detail.js is NOT present
	var zoomMainProduct = document.getElementById('product-main-img');
	if (zoomMainProduct && !document.querySelector('script[src*="product-detail"]')) {
		$('#product-main-img').slick({
	    infinite: true,
	    speed: 300,
	    dots: false,
	    arrows: true,
	    fade: true,
	    asNavFor: '#product-imgs',
	  });

		$('#product-imgs').slick({
	    slidesToShow: 3,
	    slidesToScroll: 1,
	    arrows: true,
	    centerMode: true,
	    focusOnSelect: true,
			centerPadding: 0,
			vertical: true,
	    asNavFor: '#product-main-img',
			responsive: [{
	        breakpoint: 991,
	        settings: {
						vertical: false,
						arrows: false,
						dots: true,
	        }
	      },
	    ]
	  });

		$('#product-main-img .product-preview').zoom();
	}

	/////////////////////////////////////////

	// Input number
	$('.input-number').each(function() {
		var $this = $(this),
		$input = $this.find('input[type="number"]'),
		up = $this.find('.qty-up'),
		down = $this.find('.qty-down');

		down.on('click', function () {
			var value = parseInt($input.val()) - 1;
			value = value < 1 ? 1 : value;
			$input.val(value);
			$input.change();
			updatePriceSlider($this , value)
		})

		up.on('click', function () {
			var value = parseInt($input.val()) + 1;
			var max = parseInt($input.attr('max'));
			if (!isNaN(max) && value > max) value = max;
			$input.val(value);
			$input.change();
			updatePriceSlider($this , value)
		})
	});

	var priceInputMax = document.getElementById('price-max'),
			priceInputMin = document.getElementById('price-min');

	if (priceInputMax) {
		priceInputMax.addEventListener('change', function(){
			updatePriceSlider($(this).parent() , this.value)
		});
	}

	if (priceInputMin) {
		priceInputMin.addEventListener('change', function(){
			updatePriceSlider($(this).parent() , this.value)
		});
	}

	function updatePriceSlider(elem , value) {
		if ( elem.hasClass('price-min') ) {
			priceSlider.noUiSlider.set([value, null]);
		} else if ( elem.hasClass('price-max')) {
			priceSlider.noUiSlider.set([null, value]);
		}
	}

	// Price Slider
	var priceSlider = document.getElementById('price-slider');
	if (priceSlider) {
		noUiSlider.create(priceSlider, {
			start: [1, 999],
			connect: true,
			step: 1,
			range: {
				'min': 1,
				'max': 999
			}
		});

		priceSlider.noUiSlider.on('update', function( values, handle ) {
			var value = values[handle];
			handle ? priceInputMax.value = value : priceInputMin.value = value
		});
	}

})(jQuery);
