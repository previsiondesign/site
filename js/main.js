// Prevision Design - Option B2: Boxed Canvas

// Contact form delivery endpoint (Cloudflare Pages Function -> Resend).
// Set to '' to run the form in mockup mode (validates, shows the success panel,
// sends nothing and says so).
const FORM_ENDPOINT = 'https://clients.previsiondesign.com/api/contact';

// Attachment limits — keep in sync with functions/api/contact.js in the clients repo.
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

document.addEventListener('DOMContentLoaded', () => {
  // Sticky header shadow
  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    });
  }

  // Mobile nav toggle
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        toggle.classList.remove('open');
        nav.classList.remove('open');
      });
    });
  }

  // Featured Work: each card rests on its main still and cross-fades through the
  // project's other frames while hovered. Frames live in data-frames and are only
  // fetched on first hover, so the grid costs one image per card until then —
  // eager markup for all 48 would be several MB nobody asked for.
  const workCards = Array.from(
    document.querySelectorAll('.project-card[data-frames], .project-card[data-video]'));

  workCards.forEach((card) => {
    const WORK = 'shared/images/work/';
    const HOLD = 900;      // ms a frame is held
    const LEAD_IN = 500;   // ms the main still holds after rollover, so the
                           // re-saturation lands before anything starts moving
    // cross-fade length; data-fade overrides it per card and is mirrored into
    // --pc-fade so the CSS transition and this timer stay in step
    const FADE = parseInt(card.dataset.fade, 10) || 500;
    const files = (card.dataset.frames || '').split(',').filter(Boolean);
    // data-holds gives per-frame hold times where a project needs them — the
    // Old Bayshore pairs run 1.5s on each existing view, 2.5s on each proposal
    const holds = (card.dataset.holds || '').split(',')
      .map((n) => parseInt(n, 10)).filter((n) => n > 0);
    const clip = card.dataset.video;
    const overlay = card.querySelector('.overlay');
    const still = card.querySelector('img');
    let layers = null;
    let video = null;
    let at = 0;
    let stepTimer = null;
    let resetTimer = null;
    let prefetched = false;
    let live = false;   // true only between mouseenter and mouseleave

    // an auto-cycling slideshow is exactly what reduced-motion asks us not to do
    const stillPlease = window.matchMedia('(prefers-reduced-motion: reduce)');

    function layer(i) {
      if (!layers) {
        layers = [0, 1].map(() => {
          const el = document.createElement('img');
          el.className = 'pc-frame';
          el.alt = '';
          el.setAttribute('aria-hidden', 'true');
          el.style.setProperty('--pc-fade', FADE + 'ms');
          card.insertBefore(el, overlay);
          return el;
        });
      }
      return layers[i % 2];
    }

    // One Image per frame, reused. A fresh Image() each step re-requests the
    // file, and without cache headers that is a revalidation round-trip per
    // frame — a fixed cost on top of every hold, which threw the timing out.
    const warmed = new Map();
    function warm(file) {
      let img = warmed.get(file);
      if (!img) { img = new Image(); img.src = WORK + file; warmed.set(file, img); }
      return img;
    }

    function step() {
      const el = layer(at);
      const under = layers[(at + 1) % 2];
      const file = files[at % files.length];
      const src = WORK + file;
      const pre = warm(file);
      // wait for the bitmap so a layer is never revealed blank
      const reveal = () => {
        // the pointer can leave while a frame is still loading; without this the
        // callback would show it and queue the next step, and the slideshow would
        // carry on running after mouseout
        if (!live) return;
        el.src = src;
        // demote the outgoing layer NOW, not after the fade: while both sat at
        // the same z-index, DOM order decided the stack and the old frame could
        // paint over the incoming one, so the cross-fade did nothing then jumped
        under.style.zIndex = 1;
        el.style.zIndex = 2;
        el.classList.add('is-shown');
        // it only goes transparent once it is covered, so its next turn
        // starts from 0 and actually cross-fades
        resetTimer = setTimeout(() => under.classList.remove('is-shown'), FADE);
        const hold = holds.length ? holds[at % holds.length] : HOLD;
        at += 1;
        stepTimer = setTimeout(step, hold);
      };
      if (pre.complete) reveal();
      else {
        pre.addEventListener('load', reveal, { once: true });
        pre.addEventListener('error', reveal, { once: true });
      }
    }

    function start() {
      if (stillPlease.matches) return;
      // mouseenter and focusin both fire when a card is clicked; without this a
      // second chain of timers starts alongside the first and they race, each
      // advancing the frame counter
      if (live) return;
      live = true;
      if (clip) {
        if (!video) {
          video = document.createElement('video');
          video.className = 'pc-frame';
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = 'none';
          video.setAttribute('aria-hidden', 'true');
          video.src = WORK + clip;
          card.insertBefore(video, overlay);
        }
        // same lead-in as the slideshow: let the colour come back first
        stepTimer = setTimeout(() => {
          if (!live) return;
          video.classList.add('is-shown');
          try { video.currentTime = 0; video.play(); } catch (err) { /* blocked */ }
        }, LEAD_IN);
        return;
      }
      if (!files.length) return;
      // warm the whole set on the first hover so later steps keep to their hold
      // rather than stalling on a fetch; the browser caps its own parallelism
      if (!prefetched) {
        prefetched = true;
        files.forEach(warm);
      }
      at = 0;
      // hold the main still briefly so the re-saturation reads before the
      // slideshow starts moving (Adam, 2026-07-28)
      stepTimer = setTimeout(step, LEAD_IN);
    }

    function stop() {
      live = false;
      clearTimeout(stepTimer);
      clearTimeout(resetTimer);
      if (video) { video.classList.remove('is-shown'); video.pause(); }
      if (layers) layers.forEach((el) => el.classList.remove('is-shown'));
    }

    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
    // keyboard users get it too, since the card is a focus target on the grid
    card.addEventListener('focusin', start);
    card.addEventListener('focusout', stop);
    if (still) still.addEventListener('dragstart', (e) => e.preventDefault());
  });

  // Discipline snippets sit greyscale until something singles a card out. On a
  // hover device that is :hover (CSS); on a touch device there is nothing to
  // hover, so the card nearest the middle of the viewport lights as you scroll.
  const shotCards = Array.from(document.querySelectorAll('.service-card'))
    .filter((c) => c.querySelector('.service-shot'));
  if (shotCards.length) {
    const canHover = window.matchMedia('(hover: hover)');
    let queued = false;

    function lightCentred() {
      queued = false;
      const middle = window.innerHeight / 2;
      // start at a threshold rather than Infinity: with the grid off-screen or
      // straddling the edge, nothing should be lit
      let best = null;
      let bestGap = window.innerHeight * 0.35;
      shotCards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const gap = Math.abs((r.top + r.bottom) / 2 - middle);
        if (gap < bestGap) { bestGap = gap; best = card; }
      });
      shotCards.forEach((c) => c.classList.toggle('is-lit', c === best));
    }

    function onScroll() {
      if (!queued) { queued = true; requestAnimationFrame(lightCentred); }
    }

    function syncLighting() {
      if (canHover.matches) {
        window.removeEventListener('scroll', onScroll);
        shotCards.forEach((c) => c.classList.remove('is-lit'));
      } else {
        window.addEventListener('scroll', onScroll, { passive: true });
        lightCentred();
      }
    }

    canHover.addEventListener('change', syncLighting);
    window.addEventListener('resize', onScroll, { passive: true });
    syncLighting();
  }

  // ≤768px: the hero buttons move out of the image and into the stats bar, so
  // the headline block can sit lower and show more of the picture. Moved rather
  // than duplicated to keep one copy of the labels; the hero already needs JS
  // to run at all, so there is no no-JS case to fall back to.
  const heroActions = document.querySelector('.hero-actions');
  const statsActions = document.getElementById('stats-actions');
  if (heroActions && statsActions) {
    const heroHome = heroActions.parentNode;
    const heroNext = heroActions.nextElementSibling;   // .hero-dots
    const narrow = window.matchMedia('(max-width: 768px)');
    const placeActions = () => {
      if (narrow.matches) statsActions.appendChild(heroActions);
      else heroHome.insertBefore(heroActions, heroNext);
    };
    narrow.addEventListener('change', placeActions);
    placeActions();
  }

  // Hero: five 6s series. Frames inside a series hold for their own data-dur
  // (mirroring the _#s in the master filenames), cross-fading between them.
  // Images/video load lazily: current series plus the next one.
  const series = Array.from(document.querySelectorAll('.hero-serie'));
  const tagline = document.querySelector('.hero-tagline');
  const dotsWrap = document.querySelector('.hero-dots');
  if (series.length && tagline && dotsWrap) {
    const SERIE_FADE = 1000;  // keep in step with the .hero-serie transition
    const frameTimers = [];
    let current = 0;
    let serieTimer = null;
    let hideTimer = null;
    let taglineTimer = null;
    let zTop = 1;

    const dots = series.map((s, i) => {
      const d = document.createElement('button');
      d.className = 'hero-dot' + (i === 0 ? ' is-active' : '');
      d.setAttribute('aria-label', 'Slide ' + (i + 1));
      d.addEventListener('click', () => { show(i); });
      dotsWrap.appendChild(d);
      return d;
    });

    const durations = series.map((s) =>
      Array.from(s.querySelectorAll('.hero-frame'))
        .reduce((sum, f) => sum + (parseInt(f.dataset.dur, 10) || 1000), 0)
    );

    function load(serie) {
      serie.querySelectorAll('img[data-src], video[data-src]').forEach((el) => {
        el.src = el.dataset.src;
        el.removeAttribute('data-src');
      });
    }

    function clearFrameTimers() {
      while (frameTimers.length) clearTimeout(frameTimers.pop());
    }

    // Put a series back to its first frame. Done while the series is still
    // transparent (or covered), with transitions off so the reset can't animate.
    function resetFrames(serie) {
      const frames = Array.from(serie.querySelectorAll('.hero-frame'));
      frames.forEach((f, i) => {
        f.style.transition = 'none';
        f.style.zIndex = i;              // later frames fade in over earlier ones
        f.classList.toggle('is-shown', i === 0);
      });
      void serie.offsetWidth;            // flush the reset before re-enabling
      frames.forEach((f) => { f.style.transition = ''; });
      return frames;
    }

    // Step through a series' frames, holding each for its own duration. A frame
    // fades in on top and the one under it stays put, so there is no dip.
    function runFrames(serie) {
      const frames = resetFrames(serie);
      let at = 0;
      frames.slice(0, -1).forEach((f, i) => {
        const hold = parseInt(f.dataset.dur, 10) || 1000;
        at += hold;
        frameTimers.push(setTimeout(() => {
          // data-fade wins where a frame wants its own timing (the Bayshore
          // before/after runs 2s); otherwise long holds get 1s and the 1s study
          // frames get 600ms so they still read as separate steps
          const fade = parseInt(frames[i + 1].dataset.fade, 10) || (hold >= 2000 ? 1000 : 600);
          frames[i + 1].style.setProperty('--fade', fade + 'ms');
          frames[i + 1].classList.add('is-shown');
        }, at));
      });
      const video = serie.querySelector('video');
      if (video && video.src) {
        try { video.currentTime = 0; video.play(); } catch (err) { /* autoplay blocked */ }
      }
    }

    function show(n) {
      clearFrameTimers();
      clearTimeout(serieTimer);
      clearTimeout(hideTimer);

      current = n;
      const serie = series[current];
      load(serie);
      load(series[(current + 1) % series.length]); // warm the next one

      // restart the Ken Burns drift from the top of its keyframes
      serie.style.animation = 'none';
      void serie.offsetWidth;
      serie.style.animation = '';

      // The incoming series fades in on top; the outgoing one stays opaque
      // underneath until it is fully covered, so the cross-fade never shows
      // the background through two half-transparent layers.
      serie.style.zIndex = ++zTop;
      serie.classList.add('is-active');
      dots.forEach((d, i) => d.classList.toggle('is-active', i === n));

      hideTimer = setTimeout(() => {
        series.forEach((s, i) => {
          if (i === current) return;
          s.classList.remove('is-active');
          const v = s.querySelector('video');
          if (v) v.pause();
        });
      }, SERIE_FADE);

      // tracked, so clicking dots faster than the fade can't strand the tagline
      // mid-fade (invisible) or land a stale swap after a newer one
      clearTimeout(taglineTimer);
      if (tagline.textContent !== serie.dataset.tagline) {
        tagline.classList.add('is-fading');
        taglineTimer = setTimeout(() => {
          tagline.textContent = serie.dataset.tagline;
          tagline.classList.remove('is-fading');
        }, 400);
      } else {
        tagline.classList.remove('is-fading');
      }

      runFrames(serie);
      serieTimer = setTimeout(() => show((current + 1) % series.length), durations[current]);
    }

    show(0);
  }

  // Contact form (contact.html)
  const form = document.getElementById('contact-form');
  if (form) {
    const errorBox = document.getElementById('form-error');
    const success = document.getElementById('form-success');
    const demoNote = document.getElementById('demo-note');
    const btn = document.getElementById('submit-btn');

    const clearInvalid = (el) => el.classList.remove('invalid');
    form.querySelectorAll('input, textarea').forEach((el) => {
      el.addEventListener('input', () => clearInvalid(el));
    });

    // ---- optional attachments ----
    const fileInput = document.getElementById('files');
    const fileDrop = document.getElementById('file-drop');
    const attachList = document.getElementById('attach-list');
    let attachments = []; // File objects

    const fmtSize = (b) =>
      b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

    function renderAttachments() {
      attachList.innerHTML = '';
      attachments.forEach((f, i) => {
        const li = document.createElement('li');
        const nm = document.createElement('span');
        nm.className = 'aname';
        nm.textContent = f.name;
        const sz = document.createElement('span');
        sz.className = 'asize';
        sz.textContent = fmtSize(f.size);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'aremove';
        rm.setAttribute('aria-label', 'Remove ' + f.name);
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          attachments.splice(i, 1);
          renderAttachments();
        });
        li.append(nm, sz, rm);
        attachList.appendChild(li);
      });
    }

    function addFiles(list) {
      errorBox.hidden = true;
      for (const f of list) {
        if (attachments.length >= MAX_FILES) {
          errorBox.textContent = `You can attach up to ${MAX_FILES} files — send the form and we'll reply with an upload link for the rest.`;
          errorBox.hidden = false;
          break;
        }
        if (f.size > MAX_FILE_BYTES) {
          errorBox.textContent = `"${f.name}" is larger than 10 MB — send the form and we'll reply with an upload link.`;
          errorBox.hidden = false;
          continue;
        }
        const total = attachments.reduce((n, a) => n + a.size, 0) + f.size;
        if (total > MAX_TOTAL_BYTES) {
          errorBox.textContent = 'Attachments total more than 30 MB — please remove one.';
          errorBox.hidden = false;
          continue;
        }
        attachments.push(f);
      }
      renderAttachments();
    }

    if (fileDrop && fileInput) {
      fileDrop.addEventListener('click', () => fileInput.click());
      fileDrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      });
      fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
      ['dragenter', 'dragover'].forEach((ev) =>
        fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.add('drag'); })
      );
      ['dragleave', 'drop'].forEach((ev) =>
        fileDrop.addEventListener(ev, (e) => { e.preventDefault(); fileDrop.classList.remove('drag'); })
      );
      fileDrop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    }

    const toBase64 = (file) =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.hidden = true;

      // Validate required fields + email shape.
      const required = ['name', 'email', 'message'];
      let firstBad = null;
      for (const id of required) {
        const el = document.getElementById(id);
        const empty = !el.value.trim();
        el.classList.toggle('invalid', empty);
        if (empty && !firstBad) firstBad = el;
      }
      const email = document.getElementById('email');
      if (!firstBad && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        email.classList.add('invalid');
        firstBad = email;
        errorBox.textContent = 'Please enter a valid email address so we can reply.';
        errorBox.hidden = false;
        email.focus();
        return;
      }
      if (firstBad) {
        errorBox.textContent = 'Please fill in the required fields marked with *.';
        errorBox.hidden = false;
        firstBad.focus();
        return;
      }

      // Silently drop bot submissions that fill the hidden field.
      if (document.getElementById('website').value) return;

      const payload = {
        name: document.getElementById('name').value.trim(),
        email: email.value.trim(),
        company: document.getElementById('company').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        project: document.getElementById('project').value.trim(),
        services: [...form.querySelectorAll('input[name="services"]:checked')].map((c) => c.value),
        message: document.getElementById('message').value.trim(),
      };

      btn.disabled = true;
      btn.textContent = attachments.length ? 'Uploading…' : 'Sending…';

      if (FORM_ENDPOINT) {
        try {
          payload.files = await Promise.all(
            attachments.map(async (f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              data: await toBase64(f),
            }))
          );
          const res = await fetch(FORM_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            let msg = '';
            try { msg = (await res.json()).error || ''; } catch { /* non-JSON */ }
            // 503 = endpoint deployed but no mail key yet; don't show internals.
            if (res.status === 503) msg = 'The form isn’t live yet.';
            throw new Error(msg || 'bad status ' + res.status);
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Send Inquiry';
          errorBox.textContent =
            (err && err.message && !/bad status/.test(err.message) ? err.message + ' ' : '') +
            'Please try again, or email info@previsiondesign.com directly.';
          errorBox.hidden = false;
          return;
        }
      } else {
        demoNote.hidden = false; // mockup mode: be explicit that nothing was sent
      }

      form.hidden = true;
      success.hidden = false;
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
});
