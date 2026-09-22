export function TitleBar({ guide = false }: { guide?: boolean }) {
  return <header className={`title-bar${guide ? ' title-bar-guide' : ''}`} aria-label="应用标题栏">
    <div className="title-bar-safe-area">
      <div className="title-bar-caption">
        <img src="./app-icon.svg" alt="" draggable={false}/>
        <span>{guide ? '使用说明 · 荣耀车队' : '荣耀车队'}</span>
      </div>
    </div>
  </header>;
}
