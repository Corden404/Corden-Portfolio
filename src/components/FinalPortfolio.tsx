import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, ExternalLink, X } from 'lucide-react';
import { portfolio } from '../config/portfolio';
import type { PortfolioProject } from '../config/portfolio';
import { assetUrl } from '../utils/assetUrl';

function ProjectMedia({ project, detail = false }: { project: PortfolioProject; detail?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const cover = project.cover;
  const showCover = Boolean(cover && failedSource !== cover.src);
  const evidence = project.achievements?.[project.id === 'paper-a' ? 2 : 0] ?? project.subtitle;
  const caption = showCover && cover ? cover.caption : cover ? '图片暂不可用 · 项目记录' : '项目记录 · 公开成果摘要';

  return (
    <>
    <span className={'project-media' + (detail ? ' project-media--detail' : '') + (!showCover ? ' project-media--fallback' : '')} style={{ background: project.accent }}>
      {showCover && cover ? (
        <img
          className="project-media__image"
          src={assetUrl(cover.src)} alt={cover.alt}
          loading={detail ? 'eager' : 'lazy'} decoding="async"
          style={{ objectPosition: cover.position ?? 'center', objectFit: detail ? 'contain' : cover.fit ?? 'cover' }}
          onError={() => setFailedSource(cover.src)}
        />
      ) : (
        <span className="project-media__fallback">
          <span className="project-media__label">{cover ? '图片暂不可用' : '项目记录'} / {project.number}</span>
          <span className="project-media__name">{project.works?.map(work => work.title).join(' / ') || project.description}</span>
          <span className="project-media__evidence">{evidence}</span>
        </span>
      )}
      <span className="project-media__index" aria-hidden="true">{project.number}</span>
    </span>
    {detail ? <figcaption>{caption}</figcaption> : <span className="project-card__caption">{caption}</span>}
    </>
  );
}

function ProjectDetail({ project, onClose }: { project: PortfolioProject; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []).filter(control => control.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        const active = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
          heading.current?.focus();
        } else if (!controls.includes(active as HTMLElement) || active === (event.shiftKey ? first : last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="detail-backdrop" onClick={onClose} role="presentation">
      <section
        ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="detail-modal" onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-topline">
          <span>项目详情 / {project.number}</span>
          <button className="detail-close" type="button" aria-label="关闭项目详情" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="detail-eyebrow">{project.category} / {project.year}</p>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{project.title.replace('\n', ' ')}</h2>
        <p className="detail-summary">{project.summary}</p>
        <figure className="detail-cover">
          <ProjectMedia project={project} detail />
        </figure>
        <div className="detail-works">
          {project.works?.length ? project.works.map(work => (
            <section className="detail-work" key={work.title}>
              <h3>{work.title}</h3>
              <p className="detail-body">{work.description}</p>
              {work.url && <a href={work.url} target="_blank" rel="noopener noreferrer">查看项目记录 <ArrowUpRight size={16} /></a>}
            </section>
          )) : <p className="detail-body">{project.description}</p>}
        </div>
        {project.achievements?.length ? (
          <section className="detail-achievements">
            <h3>已完成的工作</h3>
            <ul className="detail-body">{project.achievements.map(achievement => <li key={achievement}>{achievement}</li>)}</ul>
          </section>
        ) : null}
        {project.website && <a className="detail-site-link" href={'https://' + project.website} target="_blank" rel="noopener noreferrer">访问在线应用 <ArrowUpRight size={16} /></a>}
        <div className="detail-tags">{project.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div>
        <p className="detail-footnote">{project.subtitle}</p>
      </section>
    </div>
  );
}

type Props = { onRevisit: () => void };

export default function FinalPortfolio({ onRevisit }: Props) {
  const [selected, setSelected] = useState<PortfolioProject | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const background = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const contact = Boolean(portfolio.email || portfolio.github);
  const workCount = portfolio.projects.reduce((count, project) => count + (project.works?.length ?? 1), 0);
  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const container = page.current;
    const nav = navigation.current;
    if (!container || !nav) return;
    const updateNavigationHeight = () => {
      container.style.setProperty('--portfolio-nav-height', nav.offsetHeight + 'px');
    };
    updateNavigationHeight();
    const observer = new ResizeObserver(updateNavigationHeight);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!selected || !page.current || !background.current) return;
    const container = page.current;
    const content = background.current;
    const previousOverflow = container.style.overflowY;
    const previousInert = content.inert;
    content.inert = true;
    container.style.overflowY = 'hidden';
    return () => {
      content.inert = previousInert;
      container.style.overflowY = previousOverflow;
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus({ preventScroll: true });
    };
  }, [selected]);

  return (
    <div className="portfolio-web" ref={page}>
      <div className="portfolio-content" ref={background}>
        <nav className="portfolio-nav" ref={navigation} aria-label="作品集导航">
          <a className="brand brand--dark" href="#top">
            <span className="brand-icon">{portfolio.monogram}</span>
            <span className="brand-label">{portfolio.name}<small>作品集 / 2026</small></span>
          </a>
          <div className="portfolio-nav__right">
            <a href="#works">作品</a>
            <a href="#about">关于</a>
            {contact && <a href="#contact">联系</a>}
            <button type="button" onClick={onRevisit} className="nav-revisit"><ArrowLeft size={16} /> 重访纸面场景</button>
          </div>
        </nav>

        <main id="top" className="portfolio-main" ref={main} tabIndex={-1} aria-label="Corden 的作品与项目">
          <header className="web-hero">
            <div className="web-hero__copy">
              <p className="label-row"><span className="dot" /> CORDEN / 个人项目与开源实践</p>
              <h1>从一个想法，<br /><em>到可以运行的作品。</em></h1>
              <p className="web-hero__lede">{portfolio.introduction}</p>
              <a href="#works" className="web-scroll">浏览 {workCount} 项作品 <ArrowDown size={19} /></a>
            </div>
            <div className="web-hero__glyph" aria-hidden="true">
              <div className="orbital orbital--one" />
              <div className="orbital orbital--two" />
              <div className="orbital orbital--three" />
              <div className="orbital-core">{portfolio.monogram}</div>
            </div>
            <p className="web-hero__side">从纸面探索，到项目记录</p>
          </header>

          <section className="web-works" id="works" aria-labelledby="works-title">
            <div className="section-intro">
              <div>
                <p className="web-eyebrow">01 / 作品</p>
                <h2 id="works-title">把探索<br /><em>做成作品。</em></h2>
              </div>
              <p>{portfolio.projects.length} 个方向，{workCount} 项作品。从本地智能体到 Web 应用，打开项目了解具体实现、已完成的工作与公开记录。</p>
            </div>
            <div className="project-grid">
              {portfolio.projects.map((project: PortfolioProject) => (
                <button
                  className="project-card" type="button" key={project.id}
                  data-project-id={project.id}
                  onClick={event => { detailTrigger.current = event.currentTarget; setSelected(project); }}
                  aria-label={'查看' + project.category + '项目详情'}
                >
                  <ProjectMedia project={project} />
                  <span className="project-card__category">{project.category} / {project.year}<ArrowUpRight size={19} /></span>
                  <span className="project-card__title">{project.title.replace('\n', ' ')}</span>
                  <span className="project-card__work">{project.works?.map(work => work.title).join(' / ') || project.description}</span>
                  <span className="project-card__summary">{project.summary}</span>
                  <span className="project-card__action">查看项目详情 <ArrowUpRight size={16} /></span>
                </button>
              ))}
            </div>
          </section>

          <section className="web-about" id="about" aria-labelledby="about-title">
            <div>
              <p className="web-eyebrow">02 / 关于</p>
              <h2 id="about-title">你好，<br />我是 <em>Corden。</em></h2>
            </div>
            <div className="web-about__body">
              <p>我把兴趣落实为可以运行、可以检验的项目：让本地模型在游戏中行动，让视觉模型识别画面，也让三维创意与学习工具走进浏览器。</p>
              <p>这里记录了六个方向的九项作品，包括 AI 智能体、计算机视觉、开源工具、数据建模、三维交互与 Web 应用。我在 WebCodex 上游贡献了 22 个已合并 PR，也将论文排版流程整理为可复用的 AI Skill。每一项作品都附有具体工作与公开链接，欢迎继续了解。</p>
              <div className="about-discipline">{portfolio.discipline.split('  /  ').map(item => <span key={item}>{item}</span>)}</div>
            </div>
          </section>

          <footer id="contact" className="portfolio-footer" aria-labelledby="contact-title">
            <p className="web-eyebrow">03 / 联系与更多记录</p>
            <h2 id="contact-title">继续交流，<br /><em>从一个项目开始。</em></h2>
            <p className="footer-intro">项目源码、开源贡献与后续更新都记录在 GitHub。欢迎从你感兴趣的作品开始了解我。</p>
            <div className="footer-bottom">
              <span>© 2026 {portfolio.name} / 个人作品集</span>
              <div className="footer-links">
                {portfolio.email && <a href={'mailto:' + portfolio.email}>发送邮件 <ArrowUpRight size={16} /></a>}
                {portfolio.github && <a href={portfolio.github} target="_blank" rel="noopener noreferrer">在 GitHub 找到我 <ExternalLink size={16} /></a>}
                <button type="button" onClick={onRevisit}>重访纸面场景 <ArrowUpRight size={16} /></button>
              </div>
            </div>
          </footer>
        </main>
      </div>
      {selected && <ProjectDetail project={selected} onClose={closeDetail} />}
    </div>
  );
}
