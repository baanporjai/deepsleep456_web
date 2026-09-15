(function () {
  "use strict";

  // Footer year
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-menu]");
  if (menuToggle && menu) {
    menuToggle.addEventListener("click", function () {
      var open = menu.getAttribute("data-open") === "true";
      menu.setAttribute("data-open", String(!open));
      menuToggle.setAttribute("aria-expanded", String(!open));
    });
    menu.querySelectorAll(".nav__link").forEach(function (link) {
      link.addEventListener("click", function () {
        menu.setAttribute("data-open", "false");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Hero slider (auto-cycle background slides)
  // Slides after the first carry their image in data-bg instead of an inline
  // background so the browser doesn't fetch them eagerly and compete with
  // the LCP image; they're swapped in only after the page has settled.
  var slides = document.querySelectorAll("[data-hero-slider] .hero__slide");
  function ensureSlideBg(slide) {
    var bg = slide.getAttribute("data-bg");
    if (bg && !slide.style.backgroundImage) slide.style.backgroundImage = "url('" + bg + "')";
  }
  if (slides.length > 1) {
    var current = 0;
    // Warm only the second slide shortly before the first rotation; every
    // later slide is warmed one rotation ahead. Loading all of them at once
    // used to pull ~550KB during page load and wreck LCP on slow networks.
    setTimeout(function () { ensureSlideBg(slides[1]); }, 4000);
    setInterval(function () {
      var next = (current + 1) % slides.length;
      ensureSlideBg(slides[next]);
      slides[current].classList.remove("hero__slide--active");
      slides[next].classList.add("hero__slide--active");
      current = next;
      ensureSlideBg(slides[(next + 1) % slides.length]);
    }, 5500);
  }

  // Gallery filter
  var filterButtons = document.querySelectorAll(".gallery__filter");
  var galleryItems = document.querySelectorAll(".gallery__item");
  filterButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterButtons.forEach(function (b) { b.classList.remove("gallery__filter--active"); });
      btn.classList.add("gallery__filter--active");
      var filter = btn.getAttribute("data-filter");
      galleryItems.forEach(function (item) {
        var show = filter === "all" || item.getAttribute("data-category") === filter;
        item.classList.toggle("gallery__item--hidden", !show);
      });
    });
  });

  // Lightbox
  var lightbox = document.querySelector("[data-lightbox-modal]");
  var lightboxImg = lightbox ? lightbox.querySelector(".lightbox__image") : null;
  var closeBtn = document.querySelector("[data-lightbox-close]");
  var prevBtn = document.querySelector("[data-lightbox-prev]");
  var nextBtn = document.querySelector("[data-lightbox-next]");
  var galleryList = Array.prototype.slice.call(galleryItems);
  var activeIndex = -1;

  function visibleItems() {
    return galleryList.filter(function (item) { return !item.classList.contains("gallery__item--hidden"); });
  }

  function openLightbox(item) {
    var items = visibleItems();
    activeIndex = items.indexOf(item);
    showActive(items);
    lightbox.setAttribute("data-open", "true");
    lightbox.setAttribute("aria-hidden", "false");
  }

  function showActive(items) {
    if (!items.length) return;
    var item = items[activeIndex];
    var src = item.getAttribute("data-lightbox");
    var alt = item.querySelector("img").getAttribute("alt");
    lightboxImg.setAttribute("src", src);
    lightboxImg.setAttribute("alt", alt);
  }

  function closeLightbox() {
    lightbox.setAttribute("data-open", "false");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.setAttribute("src", "");
  }

  galleryItems.forEach(function (item) {
    item.addEventListener("click", function () { openLightbox(item); });
  });
  if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });
  }
  if (prevBtn) prevBtn.addEventListener("click", function () {
    var items = visibleItems();
    if (!items.length) return;
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    showActive(items);
  });
  if (nextBtn) nextBtn.addEventListener("click", function () {
    var items = visibleItems();
    if (!items.length) return;
    activeIndex = (activeIndex + 1) % items.length;
    showActive(items);
  });
  document.addEventListener("keydown", function (e) {
    if (lightbox && lightbox.getAttribute("data-open") === "true") {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft" && prevBtn) prevBtn.click();
      if (e.key === "ArrowRight" && nextBtn) nextBtn.click();
    }
  });

  // Amenity photo preview: hover (desktop) or tap (touch) reveals a supporting
  // photo. The image is only fetched on first interaction, not on page load.
  var amenityCards = document.querySelectorAll("[data-photo]");
  var activeAmenity = null;

  function loadAmenityPhoto(card) {
    var img = card.querySelector(".amenity__preview img");
    if (img && !img.getAttribute("src")) {
      img.setAttribute("src", card.getAttribute("data-photo"));
      img.setAttribute("alt", card.getAttribute("data-photo-alt") || "");
    }
  }

  function closeAmenity(card) {
    card.classList.remove("is-active");
    if (activeAmenity === card) activeAmenity = null;
  }

  amenityCards.forEach(function (card) {
    card.addEventListener("mouseenter", function () { loadAmenityPhoto(card); });
    card.addEventListener("focus", function () { loadAmenityPhoto(card); });
    card.addEventListener("click", function () {
      loadAmenityPhoto(card);
      var willOpen = !card.classList.contains("is-active");
      if (activeAmenity && activeAmenity !== card) closeAmenity(activeAmenity);
      card.classList.toggle("is-active", willOpen);
      activeAmenity = willOpen ? card : null;
    });
  });
  document.addEventListener("click", function (e) {
    if (activeAmenity && !activeAmenity.contains(e.target)) closeAmenity(activeAmenity);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && activeAmenity) closeAmenity(activeAmenity);
  });

  // Live temperature badge in the climate section (Open-Meteo, no API key,
  // modeled for the property's exact coordinates rather than the district).
  var climateLive = document.querySelector("[data-climate-live]");
  if (climateLive) {
    var lang = document.documentElement.lang === "en" ? "en" : "th";
    var weatherLabels = {
      th: { 0: "ท้องฟ้าแจ่มใส", 1: "มีเมฆบางส่วน", 2: "มีเมฆบางส่วน", 3: "เมฆมาก", 45: "หมอก", 48: "หมอก",
        51: "ฝนตกปรอยๆ", 53: "ฝนตกปรอยๆ", 55: "ฝนตกปรอยๆ", 61: "ฝนตกเล็กน้อย", 63: "ฝนตกปานกลาง", 65: "ฝนตกหนัก",
        80: "ฝนตกเป็นช่วง", 81: "ฝนตกเป็นช่วง", 82: "ฝนตกหนักเป็นช่วง", 95: "พายุฝนฟ้าคะนอง" },
      en: { 0: "Clear sky", 1: "Partly cloudy", 2: "Partly cloudy", 3: "Overcast", 45: "Foggy", 48: "Foggy",
        51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 61: "Light rain", 63: "Moderate rain", 65: "Heavy rain",
        80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 95: "Thunderstorm" }
    };
    var textEl = climateLive.querySelector(".climate-live__text");
    var loadWeather = function () {
      fetch("https://api.open-meteo.com/v1/forecast?latitude=18.8922564&longitude=98.8279099&current=temperature_2m,weather_code&timezone=Asia%2FBangkok")
        .then(function (res) { if (!res.ok) throw new Error("bad response"); return res.json(); })
        .then(function (data) {
          var c = data.current;
          var label = weatherLabels[lang][c.weather_code] || (lang === "th" ? "มีเมฆ" : "Cloudy");
          var time = new Date(c.time).toLocaleTimeString(lang === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" });
          textEl.textContent = lang === "th"
            ? "อุณหภูมิตอนนี้ที่โป่งแยง: " + c.temperature_2m.toFixed(1) + "°C · " + label + " · อัปเดต " + time + " น."
            : "Right now in Pong Yaeng: " + c.temperature_2m.toFixed(1) + "°C · " + label + " · updated " + time;
          climateLive.classList.remove("climate-live--loading");
        })
        .catch(function () {
          climateLive.classList.add("climate-live--error");
        });
    };
    // Not part of the visible content on load, so keep it off the critical
    // request chain: fetch only once the page has fully loaded and the
    // browser is idle.
    if (document.readyState === "complete") {
      window.requestIdleCallback ? window.requestIdleCallback(loadWeather) : setTimeout(loadWeather, 0);
    } else {
      window.addEventListener("load", function () {
        window.requestIdleCallback ? window.requestIdleCallback(loadWeather) : setTimeout(loadWeather, 0);
      });
    }
  }

  // Review video: the YouTube player is only loaded after the visitor taps
  // play, so the heavy embed script never affects initial page load.
  var videoFacades = document.querySelectorAll(".video-facade[data-video-id]");
  for (var v = 0; v < videoFacades.length; v++) {
    videoFacades[v].addEventListener("click", function () {
      var id = this.getAttribute("data-video-id");
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&playsinline=1";
      iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
      iframe.title = this.getAttribute("aria-label") || "Review video";
      iframe.setAttribute("allowfullscreen", "");
      this.innerHTML = "";
      this.appendChild(iframe);
      this.style.cursor = "default";
    }, { once: true });
  }

  // Influencer / affiliate referral tracking. A partner shares a link like
  // ?ref=NEWVI; we remember the code for the session, show a banner, and
  // rewrite LINE links to a pre-filled chat message so the code travels with
  // the booking request without the guest needing to type it themselves.
  // To onboard a new partner, just add a row to REF_PARTNERS below.
  var REF_PARTNERS = {
    NEWVI: { th: "เชียงใหม่ม่วนเว่อร์", en: "Chiang Mai Muan Ver" }
  };
  var refBanner = document.querySelector("[data-ref-banner]");
  if (refBanner) {
    var urlRef = new URLSearchParams(location.search).get("ref");
    if (urlRef) {
      try { sessionStorage.setItem("ds456_ref", urlRef.toUpperCase()); } catch (e) {}
    }
    var activeRef = null;
    try { activeRef = sessionStorage.getItem("ds456_ref"); } catch (e) {}
    var partner = activeRef && REF_PARTNERS[activeRef];
    if (partner) {
      var refLang = document.documentElement.lang === "en" ? "en" : "th";
      var partnerName = partner[refLang];
      var bannerText = refBanner.querySelector("[data-ref-banner-text]");
      if (bannerText) {
        bannerText.innerHTML = refLang === "th"
          ? "🎉 คุณมาจาก " + partnerName + " — แจ้งโค้ด <strong>" + activeRef + "</strong> ตอนจองผ่าน LINE หรือโทร รับสิทธิพิเศษ"
          : "🎉 Referred by " + partnerName + " — mention code <strong>" + activeRef + "</strong> when you book via LINE or phone";
      }
      refBanner.hidden = false;
      refBanner.classList.add("is-visible");

      var lineMsg = refLang === "th"
        ? "สวัสดีค่ะ สนใจจองที่พัก Deepsleep456 (รหัสแนะนำ: " + activeRef + ")"
        : "Hi! I'm interested in booking Deepsleep456 (referral code: " + activeRef + ")";
      var lineLinks = document.querySelectorAll('a[href^="https://line.me/R/ti/p/"]');
      for (var l = 0; l < lineLinks.length; l++) {
        lineLinks[l].href = "https://line.me/R/oaMessage/@deepsleep456/?" + encodeURIComponent(lineMsg);
      }
    }
  }

  // Date fields that always show DD/MM/YYYY regardless of the visitor's OS
  // locale — native <input type="date"> renders in whatever format the OS
  // uses (the `lang` attribute does not override it), so each field pairs a
  // plain text input (the source of truth for display) with a hidden native
  // date input used only as a calendar-picker trigger, and a hidden
  // ISO-value input that's what actually gets submitted.
  function isoToDmy(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return match ? match[3] + "/" + match[2] + "/" + match[1] : "";
  }
  function dmyToIso(dmy) {
    var match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((dmy || "").trim());
    if (!match) return null;
    var d = match[1].padStart(2, "0"), m = match[2].padStart(2, "0"), y = match[3];
    var parsed = new Date(y + "-" + m + "-" + d + "T00:00:00");
    if (parsed.getFullYear() !== Number(y) || parsed.getMonth() + 1 !== Number(m) || parsed.getDate() !== Number(d)) return null;
    return y + "-" + m + "-" + d;
  }
  document.querySelectorAll("[data-date-field]").forEach(function (field) {
    var text = field.querySelector("[data-date-text]");
    var native = field.querySelector("[data-date-native]");
    var picker = field.querySelector("[data-date-picker]");
    var iso = field.parentElement.querySelector("[data-date-iso]");
    if (!text || !native || !iso) return;

    text.addEventListener("input", function () {
      var value = dmyToIso(text.value);
      if (value) {
        iso.value = value;
        native.value = value;
      } else {
        iso.value = "";
      }
    });
    native.addEventListener("change", function () {
      text.value = isoToDmy(native.value);
      iso.value = native.value;
    });
    if (picker) {
      picker.addEventListener("click", function () {
        if (native.showPicker) native.showPicker();
      });
    }
  });

  // Booking request modal — posts to the deepsleep456-admin Worker's public
  // API (same-origin at /admin/api/booking-requests), landing as a pending
  // row an admin approves or rejects from the back office.
  var requestModal = document.querySelector("[data-request-modal]");
  var requestOpenBtns = document.querySelectorAll("[data-request-open]");
  var requestCloseBtn = document.querySelector("[data-request-close]");
  var requestForm = document.querySelector("[data-request-form]");
  var requestStatus = document.querySelector("[data-request-status]");
  var requestSubmitBtn = document.querySelector("[data-request-submit]");

  function openRequestModal() {
    if (!requestModal) return;
    requestModal.setAttribute("data-open", "true");
    requestModal.setAttribute("aria-hidden", "false");
  }
  function closeRequestModal() {
    if (!requestModal) return;
    requestModal.setAttribute("data-open", "false");
    requestModal.setAttribute("aria-hidden", "true");
  }

  requestOpenBtns.forEach(function (btn) {
    btn.addEventListener("click", openRequestModal);
  });
  if (requestCloseBtn) requestCloseBtn.addEventListener("click", closeRequestModal);
  if (requestModal) {
    requestModal.addEventListener("click", function (e) {
      if (e.target === requestModal) closeRequestModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && requestModal && requestModal.getAttribute("data-open") === "true") closeRequestModal();
  });

  if (requestForm) {
    requestForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var formData = new FormData(requestForm);
      var payload = {
        customerName: formData.get("customerName"),
        customerPhone: formData.get("customerPhone"),
        customerEmail: formData.get("customerEmail") || null,
        checkIn: formData.get("checkIn"),
        checkOut: formData.get("checkOut"),
        note: formData.get("note") || null,
      };
      requestStatus.textContent = "กำลังส่งคำขอ...";
      requestStatus.className = "request-modal__status";
      requestSubmitBtn.disabled = true;
      fetch("/admin/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || "ส่งคำขอไม่สำเร็จ");
            return data;
          });
        })
        .then(function () {
          requestStatus.textContent = "ส่งคำขอสำเร็จ! ทีมงานจะติดต่อกลับเพื่อยืนยันเร็วๆ นี้";
          requestStatus.className = "request-modal__status request-modal__status--ok";
          requestForm.reset();
        })
        .catch(function (err) {
          requestStatus.textContent = err.message;
          requestStatus.className = "request-modal__status request-modal__status--error";
        })
        .finally(function () {
          requestSubmitBtn.disabled = false;
        });
    });
  }

  // Quick booking widget: pick dates, see the nights summary, "Book now" reveals
  // a LINE login step then the amenities+contact step, submit posts to the
  // same public booking-requests API as the modal above
  // (/admin/api/booking-requests — deepsleep456-admin/src/app/api/
  // booking-requests/route.ts). This only files a request; staff still review/
  // approve it into a real booking from the "คำขอจองจากเว็บ" queue.
  //
  // The LINE login step (LIFF) captures the guest's LINE userId so the admin
  // backend can push the confirmation straight into a 1:1 LINE chat with
  // them — staff then just reply inside LINE/the OA app, no separate inbox
  // needed. If the LIFF app isn't configured yet (empty data-liff-id) or the
  // SDK fails to load, we skip straight to the old flow so the booking form
  // never breaks because of it.
  var qbDatesStep = document.querySelector("[data-qb-step='dates']");
  if (qbDatesStep) {
    var qbLang = document.documentElement.lang === "en" ? "en" : "th";
    var qbCheckin = document.querySelector("[data-qb-checkin]");
    var qbCheckout = document.querySelector("[data-qb-checkout]");
    var qbSummary = document.querySelector("[data-qb-summary]");
    var qbNext = document.querySelector("[data-qb-next]");
    var qbLoginStep = document.querySelector("[data-qb-step='line-login']");
    var qbLoginRecap = document.querySelector("[data-qb-login-recap]");
    var qbLoginBack = document.querySelector("[data-qb-login-back]");
    var qbLineLoginBtn = document.querySelector("[data-qb-line-login]");
    var qbLoginError = document.querySelector("[data-qb-login-error]");
    var qbCalendarEl = document.querySelector("[data-qb-calendar]");
    var qbCalGrid = document.querySelector("[data-qb-cal-grid]");
    var qbCalMonthLabel = document.querySelector("[data-qb-cal-month]");
    var qbCalPrevBtn = document.querySelector("[data-qb-cal-prev]");
    var qbCalNextBtn = document.querySelector("[data-qb-cal-next]");
    var qbCheckinTrigger = document.querySelector("[data-qb-date-trigger='checkin']");
    var qbCheckoutTrigger = document.querySelector("[data-qb-date-trigger='checkout']");
    var qbCheckinDisplay = document.querySelector("[data-qb-checkin-display]");
    var qbCheckoutDisplay = document.querySelector("[data-qb-checkout-display]");
    var qbAmenitiesStep = document.querySelector("[data-qb-step='amenities']");
    var qbAmenitiesRecap = document.querySelector("[data-qb-amenities-recap]");
    var qbAmenitiesBack = document.querySelector("[data-qb-amenities-back]");
    var qbSuccessStep = document.querySelector("[data-qb-step='success']");
    var qbError = document.querySelector("[data-qb-error]");
    var qbReset = document.querySelector("[data-qb-reset]");
    var qbSubmitBtn = document.querySelector("[data-qb-submit]");
    var qbSection = document.getElementById("quick-booking");
    var qbLiffId = qbSection ? qbSection.getAttribute("data-liff-id") : "";
    var qbLiffReady = false;
    var qbLineProfile = null;
    var QB_PENDING_KEY = "ds456_qb_pending";

    var qbCopy = {
      th: {
        pickDates: "เลือกวันที่เพื่อดูจำนวนคืน",
        nights: function (n) { return n + " คืน"; },
        priced: function (n, total) { return n + " คืน · รวม " + qbMoney(total); },
        invalid: "วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน",
        unavailable: "ช่วงวันที่นี้ มีคนจองแล้ว กรุณาเลือกวันอื่นนะค่ะ",
        recap: function (ci, co, n, total) {
          var base = ci + " ถึง " + co + " (" + n + " คืน)";
          return total != null ? base + " · รวม " + qbMoney(total) : base;
        },
        sending: "กำลังส่ง...",
        submit: "ส่งคำขอจอง",
        genericError: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่ หรือจองผ่าน LINE/โทรแทน",
        loginError: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        addonsNote: "บริการเสริมที่เลือก: "
      },
      en: {
        pickDates: "Pick your dates to see the number of nights",
        nights: function (n) { return n + (n === 1 ? " night" : " nights"); },
        priced: function (n, total) { return n + (n === 1 ? " night" : " nights") + " · Total " + qbMoney(total); },
        invalid: "Check-out must be after check-in",
        unavailable: "These dates are fully booked — please pick different dates.",
        recap: function (ci, co, n, total) {
          var base = ci + " to " + co + " (" + n + (n === 1 ? " night" : " nights") + ")";
          return total != null ? base + " · Total " + qbMoney(total) : base;
        },
        sending: "Sending...",
        submit: "Send booking request",
        genericError: "Couldn't send your request — please try again, or book via LINE/phone instead.",
        loginError: "LINE login failed — please try again.",
        addonsNote: "Add-ons selected: "
      }
    }[qbLang];

    // Estimated price for the picked dates — same calculation as the admin
    // calendar, via the public /admin/api/pricing-quote endpoint (deepsleep456-
    // admin/src/app/api/pricing-quote/route.ts). Best-effort: if the fetch is
    // slow or fails, the nights-only summary just stays as is — price is a
    // nice-to-have and must never block the booking flow.
    var qbMoney = function (n) {
      return qbLang === "th" ? n.toLocaleString("th-TH") + " บาท" : n.toLocaleString("en-US") + " THB";
    };

    var qbPad = function (n) { return n < 10 ? "0" + n : String(n); };
    var qbDateStr = function (d) { return d.getFullYear() + "-" + qbPad(d.getMonth() + 1) + "-" + qbPad(d.getDate()); };
    var qbAddDays = function (dateStr, days) {
      var d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() + days);
      return qbDateStr(d);
    };
    var qbNightsBetween = function (ci, co) {
      var a = new Date(ci + "T00:00:00");
      var b = new Date(co + "T00:00:00");
      return Math.round((b - a) / 86400000);
    };
    var qbFormatDisplay = function (dateStr) {
      var d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(qbLang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    };

    qbCheckin.min = qbDateStr(new Date());

    var qbLastQuote = null; // { checkIn, checkOut, total } — lets qbCurrentRecap reuse the fetched price without another round trip
    var qbQuoteToken = 0;
    var qbLastAvailability = null; // { checkIn, checkOut, available } — set once /api/availability answers for these exact dates

    function qbFetchQuote(ci, co, n) {
      var token = ++qbQuoteToken;
      fetch("/admin/api/pricing-quote?checkIn=" + ci + "&checkOut=" + co)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (!data || token !== qbQuoteToken) return; // stale response from an earlier date change
          if (qbCheckin.value !== ci || qbCheckout.value !== co) return; // dates changed again while this was in flight
          qbLastQuote = { checkIn: ci, checkOut: co, total: data.total };
          if (!(qbLastAvailability && qbLastAvailability.checkIn === ci && qbLastAvailability.checkOut === co && !qbLastAvailability.available)) {
            qbSummary.textContent = qbCopy.priced(n, data.total);
          }
        })
        .catch(function () {});
    }

    // เช็คห้องว่างจริงจากระบบหลังบ้าน (deepsleep456-admin/src/app/api/availability/
    // route.ts) ทันทีที่เลือกวันที่ — กันลูกค้าเสียเวลาผ่าน LINE login + กรอกฟอร์ม
    // ทั้งหมดแล้วมาเจอปฏิเสธทีหลัง ถ้าเช็คไม่ผ่าน (fetch ล่ม/ช้า) ปล่อยให้จองต่อได้ตาม
    // ปกติ — ตัวกันจริงคือฝั่ง backend ตอนสร้างคำขอ (createBookingRequest) อยู่แล้ว
    function qbFetchAvailability(ci, co) {
      fetch("/admin/api/availability?checkIn=" + ci + "&checkOut=" + co)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (!data || qbCheckin.value !== ci || qbCheckout.value !== co) return; // dates changed again while this was in flight
          qbLastAvailability = { checkIn: ci, checkOut: co, available: data.available };
          if (!data.available) {
            qbSummary.textContent = qbCopy.unavailable;
            qbNext.disabled = true;
          }
        })
        .catch(function () {});
    }

    function qbUpdateSummary() {
      var ci = qbCheckin.value, co = qbCheckout.value;
      if (ci) qbCheckout.min = qbAddDays(ci, 1);
      if (!ci || !co) {
        qbSummary.textContent = qbCopy.pickDates;
        qbNext.disabled = true;
        return;
      }
      var n = qbNightsBetween(ci, co);
      if (n <= 0) {
        qbSummary.textContent = qbCopy.invalid;
        qbNext.disabled = true;
        return;
      }
      qbSummary.textContent = qbCopy.nights(n);
      qbNext.disabled = false;
      qbFetchQuote(ci, co, n);
      qbFetchAvailability(ci, co);
    }
    qbCheckin.addEventListener("change", qbUpdateSummary);
    qbCheckout.addEventListener("change", qbUpdateSummary);

    // Custom inline calendar replacing the native date pickers. A native
    // <input type="date"> needs its own open > scroll/tap > confirm cycle per
    // field — clunky on mobile, and doubly so across two separate fields.
    // Here the underlying <input type="date"> elements (data-qb-checkin/
    // -checkout) stay in the DOM as the source of truth (hidden, driven via
    // .value + a dispatched "change") so every existing bit of logic above
    // that already reads/writes them — quote/availability fetches, recap,
    // submit payload, LINE-login restore — keeps working untouched. This
    // block only replaces how the user picks the two values: one calendar,
    // click check-in then click check-out right after, no separate open/close
    // per field.
    var qbCalToday = new Date();
    qbCalToday.setHours(0, 0, 0, 0);
    var qbCalViewYear = qbCalToday.getFullYear();
    var qbCalViewMonth = qbCalToday.getMonth();
    var qbCalSelecting = "checkin"; // which date the next day-click sets
    var qbCalMonthFmt = new Intl.DateTimeFormat(qbLang === "th" ? "th-TH" : "en-GB", { month: "long", year: "numeric" });
    var qbDatePlaceholder = qbLang === "th" ? "เลือกวันที่" : "Select a date";

    function qbRefreshDateDisplays() {
      qbCheckinDisplay.textContent = qbCheckin.value ? qbFormatDisplay(qbCheckin.value) : qbDatePlaceholder;
      qbCheckoutDisplay.textContent = qbCheckout.value ? qbFormatDisplay(qbCheckout.value) : qbDatePlaceholder;
    }

    function qbSetDateValue(input, value) {
      input.value = value;
      input.dispatchEvent(new Event("change"));
    }

    function qbRenderCalendar() {
      qbCalMonthLabel.textContent = qbCalMonthFmt.format(new Date(qbCalViewYear, qbCalViewMonth, 1));
      var firstWeekday = new Date(qbCalViewYear, qbCalViewMonth, 1).getDay();
      var daysInMonth = new Date(qbCalViewYear, qbCalViewMonth + 1, 0).getDate();
      var todayIso = qbDateStr(qbCalToday);
      var minMonthIndex = qbCalToday.getFullYear() * 12 + qbCalToday.getMonth();
      var viewMonthIndex = qbCalViewYear * 12 + qbCalViewMonth;
      qbCalPrevBtn.disabled = viewMonthIndex <= minMonthIndex;

      var html = "";
      var i;
      for (i = 0; i < firstWeekday; i++) {
        html += '<span class="quick-booking__calendar-day quick-booking__calendar-day--empty"></span>';
      }
      for (var day = 1; day <= daysInMonth; day++) {
        var iso = qbDateStr(new Date(qbCalViewYear, qbCalViewMonth, day));
        var disabled = iso < todayIso || (qbCalSelecting === "checkout" && qbCheckin.value && iso <= qbCheckin.value);
        var classes = "quick-booking__calendar-day"
          + (iso === todayIso ? " quick-booking__calendar-day--today" : "")
          + (qbCheckin.value && iso === qbCheckin.value ? " quick-booking__calendar-day--start" : "")
          + (qbCheckout.value && iso === qbCheckout.value ? " quick-booking__calendar-day--end" : "")
          + (qbCheckin.value && qbCheckout.value && iso > qbCheckin.value && iso < qbCheckout.value ? " quick-booking__calendar-day--in-range" : "");
        html += '<button type="button" class="' + classes + '" data-qb-cal-date="' + iso + '"' + (disabled ? " disabled" : "") + '>' + day + '</button>';
      }
      qbCalGrid.innerHTML = html;
    }

    function qbOpenCalendar(selecting) {
      qbCalSelecting = selecting;
      qbCalendarEl.hidden = false;
      qbCheckinTrigger.setAttribute("aria-expanded", String(selecting === "checkin"));
      qbCheckoutTrigger.setAttribute("aria-expanded", String(selecting === "checkout"));
      var base = selecting === "checkin" ? qbCheckin.value : (qbCheckout.value || qbCheckin.value);
      if (base) {
        var d = new Date(base + "T00:00:00");
        qbCalViewYear = d.getFullYear();
        qbCalViewMonth = d.getMonth();
      }
      qbRenderCalendar();
    }

    function qbCloseCalendar() {
      qbCalendarEl.hidden = true;
      qbCheckinTrigger.setAttribute("aria-expanded", "false");
      qbCheckoutTrigger.setAttribute("aria-expanded", "false");
    }

    qbCalGrid.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-qb-cal-date]") : null;
      if (!btn || btn.disabled) return;
      // กันไม่ให้คลิกนี้ไปโดน document click-outside handler ด้านล่าง — ปุ่มที่เพิ่งกด
      // จะถูกลบทิ้งทันทีตอน re-render กริด (qbCalGrid.innerHTML = ...) ทำให้ event ที่
      // bubble ต่อไปถึง document เจอ e.target หลุดออกจาก DOM แล้ว contains() เลย false
      // แล้วปฏิทินถูกปิดผิดจังหวะ (ปิดเองทันทีหลังเลือกวันแรก ทั้งที่ควรเปิดรอเลือกวันที่สอง)
      e.stopPropagation();
      var iso = btn.getAttribute("data-qb-cal-date");

      if (qbCalSelecting === "checkin" || !qbCheckin.value || iso <= qbCheckin.value) {
        // เลือกเช็คอินใหม่ (หรือกำลังเลือกเช็คเอาท์แต่กดวันที่ก่อน/เท่ากับเช็คอินเดิม —
        // ตีความว่าอยากเริ่มช่วงใหม่จากวันนี้แทน) เริ่มช่วงใหม่เสมอ ล้างเช็คเอาท์เดิมทิ้ง
        qbSetDateValue(qbCheckin, iso);
        qbSetDateValue(qbCheckout, "");
        qbRefreshDateDisplays();
        qbCalSelecting = "checkout";
        qbCheckinTrigger.setAttribute("aria-expanded", "false");
        qbCheckoutTrigger.setAttribute("aria-expanded", "true");
        qbRenderCalendar();
        return;
      }

      qbSetDateValue(qbCheckout, iso);
      qbRefreshDateDisplays();
      qbCalSelecting = "checkin";
      qbCloseCalendar();
    });

    qbCalPrevBtn.addEventListener("click", function () {
      qbCalViewMonth -= 1;
      if (qbCalViewMonth < 0) { qbCalViewMonth = 11; qbCalViewYear -= 1; }
      qbRenderCalendar();
    });
    qbCalNextBtn.addEventListener("click", function () {
      qbCalViewMonth += 1;
      if (qbCalViewMonth > 11) { qbCalViewMonth = 0; qbCalViewYear += 1; }
      qbRenderCalendar();
    });

    qbCheckinTrigger.addEventListener("click", function () {
      if (!qbCalendarEl.hidden && qbCalSelecting === "checkin") { qbCloseCalendar(); return; }
      qbOpenCalendar("checkin");
    });
    qbCheckoutTrigger.addEventListener("click", function () {
      if (!qbCalendarEl.hidden && qbCalSelecting === "checkout") { qbCloseCalendar(); return; }
      qbOpenCalendar(qbCheckin.value ? "checkout" : "checkin");
    });

    document.addEventListener("click", function (e) {
      if (qbCalendarEl.hidden) return;
      if (qbCalendarEl.contains(e.target) || qbCheckinTrigger.contains(e.target) || qbCheckoutTrigger.contains(e.target)) return;
      qbCloseCalendar();
    });

    qbRefreshDateDisplays();

    function qbCurrentRecap() {
      var ci = qbCheckin.value, co = qbCheckout.value;
      var n = qbNightsBetween(ci, co);
      var total = (qbLastQuote && qbLastQuote.checkIn === ci && qbLastQuote.checkOut === co) ? qbLastQuote.total : null;
      return qbCopy.recap(qbFormatDisplay(ci), qbFormatDisplay(co), n, total);
    }

    function qbShowAmenities(recapText) {
      var nameInput = qbAmenitiesStep.querySelector('[name="customerName"]');
      if (nameInput && !nameInput.value && qbLineProfile && qbLineProfile.displayName) {
        nameInput.value = qbLineProfile.displayName;
      }
      if (qbLoginStep) qbLoginStep.hidden = true;
      qbAmenitiesRecap.textContent = recapText;
      qbAmenitiesStep.hidden = false;
    }

    function qbFetchProfileThenShowAmenities(recapText) {
      liff.getProfile().then(function (profile) {
        qbLineProfile = profile;
        qbShowAmenities(recapText);
      }).catch(function (err) {
        console.error("liff.getProfile failed", err);
        if (qbLoginError) {
          qbLoginError.textContent = qbCopy.loginError;
          qbLoginError.hidden = false;
        }
      });
    }

    // Restores the dates + jumps straight to the amenities/contact step after
    // LINE redirects back here post-login — the redirect is a full page
    // reload so the picked dates (never sent to LINE) have to be stashed first.
    function qbRestorePendingAfterLogin() {
      var pending = null;
      try { pending = JSON.parse(sessionStorage.getItem(QB_PENDING_KEY) || "null"); } catch (e) {}
      if (!pending || !pending.checkIn || !pending.checkOut) return;
      try { sessionStorage.removeItem(QB_PENDING_KEY); } catch (e) {}
      var n = qbNightsBetween(pending.checkIn, pending.checkOut);
      if (n <= 0) return;
      qbCheckin.value = pending.checkIn;
      qbCheckout.value = pending.checkOut;
      qbRefreshDateDisplays();
      qbDatesStep.hidden = true;
      qbFetchProfileThenShowAmenities(qbCopy.recap(qbFormatDisplay(pending.checkIn), qbFormatDisplay(pending.checkOut), n));
    }

    if (qbLiffId && typeof liff !== "undefined") {
      liff.init({ liffId: qbLiffId }).then(function () {
        qbLiffReady = true;
        if (liff.isLoggedIn()) qbRestorePendingAfterLogin();
      }).catch(function (err) {
        console.error("liff.init failed", err);
      });
    }

    qbNext.addEventListener("click", function () {
      if (qbNext.disabled) return;
      var recapText = qbCurrentRecap();
      qbDatesStep.hidden = true;

      if (qbLiffReady && liff.isLoggedIn()) {
        qbFetchProfileThenShowAmenities(recapText);
      } else if (qbLiffReady && qbLoginStep) {
        qbLoginRecap.textContent = recapText;
        qbLoginStep.hidden = false;
      } else {
        qbShowAmenities(recapText);
      }
    });

    if (qbLoginBack) {
      qbLoginBack.addEventListener("click", function () {
        qbLoginStep.hidden = true;
        qbDatesStep.hidden = false;
      });
    }

    if (qbLineLoginBtn) {
      qbLineLoginBtn.addEventListener("click", function () {
        try {
          sessionStorage.setItem(QB_PENDING_KEY, JSON.stringify({ checkIn: qbCheckin.value, checkOut: qbCheckout.value }));
        } catch (e) {}
        liff.login({ redirectUri: location.href });
      });
    }

    qbAmenitiesBack.addEventListener("click", function () {
      qbAmenitiesStep.hidden = true;
      qbDatesStep.hidden = false;
    });

    qbAmenitiesStep.addEventListener("submit", function (e) {
      e.preventDefault();
      qbError.hidden = true;
      var fd = new FormData(qbAmenitiesStep);
      var selectedAddons = fd.getAll("addons");
      var payload = {
        customerName: fd.get("customerName"),
        customerPhone: fd.get("customerPhone"),
        customerEmail: fd.get("customerEmail") || null,
        checkIn: qbCheckin.value,
        checkOut: qbCheckout.value,
        note: selectedAddons.length ? qbCopy.addonsNote + selectedAddons.join(", ") : null,
        lineUserId: qbLineProfile ? qbLineProfile.userId : null,
        lineDisplayName: qbLineProfile ? qbLineProfile.displayName : null
      };
      qbSubmitBtn.disabled = true;
      qbSubmitBtn.textContent = qbCopy.sending;
      fetch("/admin/api/booking-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (data) { throw new Error(data && data.error); });
        return res.json();
      }).then(function () {
        qbAmenitiesStep.hidden = true;
        qbSuccessStep.hidden = false;
      }).catch(function (err) {
        qbError.textContent = (err && err.message) ? err.message : qbCopy.genericError;
        qbError.hidden = false;
      }).finally(function () {
        qbSubmitBtn.disabled = false;
        qbSubmitBtn.textContent = qbCopy.submit;
      });
    });

    qbReset.addEventListener("click", function () {
      qbAmenitiesStep.reset();
      qbSuccessStep.hidden = true;
      qbAmenitiesStep.hidden = true;
      qbDatesStep.hidden = false;
      qbCheckin.value = "";
      qbCheckout.value = "";
      qbCalSelecting = "checkin";
      qbCloseCalendar();
      qbRefreshDateDisplays();
      qbUpdateSummary();
    });
  }
})();
