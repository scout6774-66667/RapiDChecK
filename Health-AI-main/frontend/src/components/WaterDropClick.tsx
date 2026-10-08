import { useEffect, useRef } from 'react';

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
}

export default function WaterDropClick() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<Ripple[]>([]);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const onClick = (e: MouseEvent) => {
      // Spawn multiple concentric ripples for a water drop effect
      const count = 3;
      for (let i = 0; i < count; i++) {
        ripples.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: 0,
          maxRadius: 40 + i * 25,
          opacity: 0.6 - i * 0.15,
          speed: 2.5 - i * 0.4,
        });
      }
    };

    window.addEventListener('click', onClick);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = ripples.current.length - 1; i >= 0; i--) {
        const r = ripples.current[i];
        r.radius += r.speed;
        r.opacity -= 0.012;

        if (r.opacity <= 0 || r.radius >= r.maxRadius) {
          ripples.current.splice(i, 1);
          continue;
        }

        const progress = r.radius / r.maxRadius;
        const alpha = r.opacity * (1 - progress);

        // Outer ring
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
        ctx.lineWidth = 2.5 * (1 - progress);
        ctx.stroke();

        // Inner fill
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.15})`;
        ctx.fill();

        // Center dot (water droplet)
        if (r.radius < r.maxRadius * 0.3) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3 * (1 - progress), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(14, 165, 233, ${alpha})`;
          ctx.fill();
        }
      }

      animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('click', onClick);
      cancelAnimationFrame(animFrame.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-[9999]"
    />
  );
}
