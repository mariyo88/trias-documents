// Animate progress bar on page load
$(document).ready(function () {
	var targetWidth = 35; // adjust this % to reflect actual progress
	setTimeout(function () {
		$('#wip-progress-bar').css('width', targetWidth + '%');
		$({ value: 0 }).animate({ value: targetWidth }, {
			duration: 1200,
			easing: 'swing',
			step: function () {
				$('#wip-percent').text(Math.round(this.value) + '%');
			},
			complete: function () {
				$('#wip-percent').text(targetWidth + '%');
			}
		});
	}, 300);
});
