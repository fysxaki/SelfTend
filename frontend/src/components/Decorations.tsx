// 背景飘浮装饰：星星、心形、波浪线、点阵
// 绝对定位铺在容器内层，pointer-events:none 不挡操作

type DecoProps = {
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
}

export function StarOutline({ size = 28, color = '#c4b5fd', strokeWidth = 2.4, style, className }: DecoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} className={className}>
      <path
        d="M12 2.5l2.7 6 6.6.7-5 4.6 1.4 6.5L12 17.1 6.3 20.3l1.4-6.5-5-4.6 6.6-.7z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  )
}

export function HeartFill({ size = 22, color = '#fbcfe8', style, className }: DecoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style} className={className}>
      <path d="M12 21s-7-4.5-9.3-9.2C1 8 3.4 4 7 4c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.6 0 6 4 4.3 7.8C19 16.5 12 21 12 21z" />
    </svg>
  )
}

type LineProps = {
  width?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
}

export function Squiggle({ width = 60, color = '#a78bfa', strokeWidth = 3, style, className }: LineProps) {
  return (
    <svg width={width} height={width / 4} viewBox="0 0 60 15" fill="none" style={style} className={className}>
      <path
        d="M2 8 Q 10 1, 18 8 T 34 8 T 50 8 T 58 8"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none"
      />
    </svg>
  )
}

export function Zigzag({ width = 50, color = '#f0abfc', strokeWidth = 3, style, className }: LineProps) {
  return (
    <svg width={width} height={width / 4} viewBox="0 0 50 12" fill="none" style={style} className={className}>
      <path
        d="M2 10 L 10 2 L 18 10 L 26 2 L 34 10 L 42 2 L 48 10"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </svg>
  )
}

export function DotsCluster({ size = 50, color = '#bae6fd', style, className }: DecoProps) {
  // 3x3 不规则点阵
  const dots = [
    [10, 10], [25, 8], [42, 12],
    [8, 26], [26, 24], [40, 28],
    [12, 42], [28, 40], [44, 42],
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" style={style} className={className}>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill={color} />
      ))}
    </svg>
  )
}

// 全屏飘浮装饰层：绝对定位、不可点击、透明 z 层
export function FloatingDecorations() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <StarOutline size={32} color="#c4b5fd"
        style={{ position: 'absolute', top: '5%',  left: '4%' }} className="deco-float" />
      <StarOutline size={22} color="#fbcfe8"
        style={{ position: 'absolute', top: '18%', right: '6%' }} className="deco-float" />
      <StarOutline size={26} color="#a7f3d0"
        style={{ position: 'absolute', top: '52%', left: '7%' }} className="deco-float" />
      <StarOutline size={20} color="#fde047"
        style={{ position: 'absolute', top: '78%', right: '5%' }} className="deco-float" />

      <HeartFill size={20} color="#fbcfe8"
        style={{ position: 'absolute', top: '10%', right: '14%' }} className="deco-pulse" />
      <HeartFill size={16} color="#bae6fd"
        style={{ position: 'absolute', top: '38%', left: '3%' }} className="deco-pulse" />
      <HeartFill size={18} color="#a7f3d0"
        style={{ position: 'absolute', top: '68%', right: '12%' }} className="deco-pulse" />
      <HeartFill size={14} color="#fef08a"
        style={{ position: 'absolute', top: '88%', left: '8%' }} className="deco-pulse" />

      <Squiggle width={55} color="#a78bfa"
        style={{ position: 'absolute', top: '26%', left: '12%', transform: 'rotate(-12deg)' }} />
      <Squiggle width={45} color="#f0abfc"
        style={{ position: 'absolute', top: '60%', right: '4%', transform: 'rotate(20deg)' }} />

      <Zigzag width={48} color="#a7f3d0"
        style={{ position: 'absolute', top: '44%', right: '10%' }} />
      <Zigzag width={36} color="#fbcfe8"
        style={{ position: 'absolute', top: '82%', left: '15%', transform: 'rotate(-20deg)' }} />

      <DotsCluster size={50} color="#c4b5fd"
        style={{ position: 'absolute', top: '14%', left: '20%' }} />
      <DotsCluster size={40} color="#bae6fd"
        style={{ position: 'absolute', top: '72%', left: '24%' }} />
      <DotsCluster size={45} color="#fbcfe8"
        style={{ position: 'absolute', top: '34%', right: '18%' }} />
    </div>
  )
}
