// ══ MOVING CARS ══════════════════════════════════════════════════════════════
//
// The car pins used to be static. A ride-hailing app's map reads as realtime
// because things MOVE on it — that is most of the difference between "a picture
// of a map" and "a map that is alive". These cars drive along the actual street
// segments, so they follow the road grid instead of drifting across blocks.
//
// HOW THE MOVEMENT WORKS
//   · each car owns one street segment and ping-pongs along it
//   · position is interpolated between the segment's two endpoints, so the path
//     is always a real road
//   · heading follows the segment angle, and the pin is rotated to match, so a
//     car driving left points left instead of always pointing right
//   · speed is per-car (roughly 12-22 world units/sec) so they do not move like
//     a rank of soldiers
//   · a car that finishes its segment picks a NEW segment that starts within
//     reach of where it stopped, so the motion is continuous rather than a jump
//
// PERFORMANCE
//   One requestAnimationFrame loop drives every car and writes a single
//   transform each. No layout, no shadow, no filter — transforms only, so the
//   whole thing stays on the compositor and costs almost nothing. The loop also
//   stops when the tab is hidden, so a backgrounded tab burns no battery.
//
// ACCESSIBILITY
//   prefers-reduced-motion turns the motion off entirely and leaves the pins
//   parked. Motion is decoration here; nobody loses information without it.

(function () {
  const NS = "http://www.w3.org/2000/svg";

  function makeCars(svg, segments, opts) {
    if (!segments.length) return { stop: function () {} };

    const cars = [];
    const rand = (a, b) => a + Math.random() * (b - a);

    function segLength(s) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      return Math.hypot(dx, dy);
    }

    function nearestSegment(x, y, exclude) {
      let best = null, bestD = Infinity;
      for (const s of segments) {
        if (exclude && s === exclude) continue;
        for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]]) {
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = s; }
        }
      }
      return best || segments[0];
    }

    function assign(car) {
      const s = car.seg;
      if (!s) {
        car.seg = segments[Math.floor(Math.random() * segments.length)];
        car.t = Math.random();
        car.dir = Math.random() < 0.5 ? 1 : -1;
        return;
      }
      // continue from whichever end we finished at, onto a road that touches it
      const endX = car.dir > 0 ? s.x2 : s.x1;
      const endY = car.dir > 0 ? s.y2 : s.y1;
      const next = nearestSegment(endX, endY, s);
      car.seg = next;
      // enter from the end of the new segment that is closest to where we are
      const d1 = Math.hypot(next.x1 - endX, next.y1 - endY);
      const d2 = Math.hypot(next.x2 - endX, next.y2 - endY);
      if (d1 <= d2) { car.t = 0; car.dir = 1; }
      else { car.t = 1; car.dir = -1; }
    }

    function place(car) {
      const s = car.seg;
      const x = s.x1 + (s.x2 - s.x1) * car.t;
      const y = s.y1 + (s.y2 - s.y1) * car.t;
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
      // flip the glyph so it always faces the direction of travel
      const facing = car.dir > 0 ? ang : ang + 180;
      car.g.setAttribute(
        "transform",
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${facing.toFixed(1)})`
      );
    }

    // build the pins
    const count = opts && opts.count ? opts.count : 0;
    for (let i = 0; i < count; i++) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "ghm-car");
      g.style.animationDelay = `${i * 0.4}s`;

      const disc = document.createElementNS(NS, "circle");
      disc.setAttribute("r", 4.6);
      g.appendChild(disc);

      const glyph = document.createElementNS(NS, "path");
      /* a simple saloon silhouette, drawn around the origin so the rotate()
         above spins it about its own centre rather than swinging it on a
         distant pivot */
      glyph.setAttribute(
        "d",
        "M-2.3 0.85h4.6M-2.2 0.85v-1.1a1.2 1.2 0 0 1 1.2-1.2h1.1a1.2 1.2 0 0 1 1.2 1.2v1.1M-1.3 0.85v0.9M1.3 0.85v0.9"
      );
      glyph.setAttribute("class", "ghm-car-glyph");
      g.appendChild(glyph);

      svg.appendChild(g);

      const car = {
        g,
        seg: null,
        t: 0,
        dir: 1,
        speed: rand(11, 21) / 100,   // fraction of a segment per second, tuned below
      };
      assign(car);
      place(car);
      cars.push(car);
    }

    let raf = null;
    let last = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      if (!last) last = now;
      const dt = Math.min((now - last) / 1000, 0.05); // clamp after a tab wake
      last = now;

      for (const car of cars) {
        const len = segLength(car.seg) || 1;
        // distance travelled this frame as a fraction of the segment
        car.t += car.dir * (car.speed * 60 * dt) / len;
        if (car.t > 1) { car.t = 1; assign(car); place(car); continue; }
        if (car.t < 0) { car.t = 0; assign(car); place(car); continue; }
        place(car);
      }
      raf = requestAnimationFrame(frame);
    }

    if (!(opts && opts.reduced)) {
      raf = requestAnimationFrame(frame);
    }

    // stop painting while the tab is in the background
    const onVis = () => {
      if (document.hidden) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      } else if (!running || !raf) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return {
      stop: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        document.removeEventListener("visibilitychange", onVis);
      },
    };
  }

  window.GogoMapCars = { makeCars };
})();
