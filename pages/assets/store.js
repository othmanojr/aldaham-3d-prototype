// Recreates Salla's product gallery (<salla-slider> = main Swiper + vertical thumbs Swiper),
// the same structure aldaham.com renders, so the 3D script runs unchanged against it.
(function () {
  function init() {
    var slider = document.querySelector('salla-slider.details-slider');
    if (!slider || !window.Swiper) return;
    var thumbsEl = slider.querySelector('.s-slider-thumbs-container');
    var mainEl = slider.querySelector('.s-slider-container');
    var thumbs = new Swiper(thumbsEl, {
      direction: 'horizontal',
      slidesPerView: 'auto',
      spaceBetween: 10,
      watchSlidesProgress: true,
      breakpoints: { 768: { direction: 'vertical', slidesPerView: 'auto', spaceBetween: 12 } }
    });
    new Swiper(mainEl, {
      slidesPerView: 1,
      spaceBetween: 0,
      thumbs: { swiper: thumbs },
      noSwipingClass: 'swiper-no-swiping'
    });
    var qty = document.querySelector('.qty');
    if (qty) {
      qty.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var input = qty.querySelector('input');
        input.value = Math.max(1, (+input.value || 1) + (b.dataset.step === '+' ? 1 : -1));
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
