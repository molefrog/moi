export default function TextureEffects() {
  return (
    <div className="text-foreground">
      <div className="bg-muted texture-checker">Checker</div>
      <div className="bg-muted texture-checker-2.5">Compact checker</div>
      <div className="bg-muted texture-checker-12">Large checker</div>
      <div className="bg-background texture-grid">Grid</div>
      <div className="bg-card texture-noise">Noise</div>
      <div className="bg-background texture-gradient-linear">Linear gradient</div>
      <div className="bg-primary text-primary-foreground texture-inset-shadow">Inset shadow</div>
    </div>
  )
}
