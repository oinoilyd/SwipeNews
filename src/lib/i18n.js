// src/lib/i18n.js — language detection, storage, and UI translation strings

export const LANG_KEY = 'sw_language';

export const LANGUAGES = {
  en: { name: 'English',    apiName: 'English',          dir: 'ltr' },
  es: { name: 'Español',    apiName: 'Spanish',           dir: 'ltr' },
  fr: { name: 'Français',   apiName: 'French',            dir: 'ltr' },
  pt: { name: 'Português',  apiName: 'Portuguese',        dir: 'ltr' },
  de: { name: 'Deutsch',    apiName: 'German',            dir: 'ltr' },
  ar: { name: 'العربية',    apiName: 'Arabic',            dir: 'rtl' },
  zh: { name: '中文',        apiName: 'Mandarin Chinese',  dir: 'ltr' },
};

export function getLanguage() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && LANGUAGES[stored]) return stored;
    // Default to browser language if supported
    const browser = (navigator.language || navigator.languages?.[0] || 'en')
      .split('-')[0].toLowerCase();
    if (LANGUAGES[browser]) return browser;
  } catch { /* SSR or storage blocked */ }
  return 'en';
}

export function setLanguage(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  window.location.reload();
}

// Apply RTL direction to document root (called once on app init)
export function applyDirection(lang) {
  document.documentElement.dir = LANGUAGES[lang]?.dir ?? 'ltr';
}

// ── Translation strings ───────────────────────────────────────────────────────
const T = {
  en: {
    // category pills
    all: 'All', hot: '🔥 Hot', follow: 'Follow',
    politics: 'Politics', usPolitics: 'US Politics', world: 'World',
    policy: 'Policy', economy: 'Economy', nationalSecurity: 'National Security',
    elections: 'Elections', technology: 'Technology', health: 'Health',
    sportsCulture: 'Sports & Culture', entertainment: 'Entertainment',
    // spectrum bar
    liberal: 'Liberal', conservative: 'Conservative', neutral: 'Neutral',
    fan: 'Fan', business: 'Business',
    optimist: 'Optimist', industry: 'Industry',
    progressive: 'Progressive', traditional: 'Traditional',
    // loading screen
    loadingStage0: "Fetching today's headlines…",
    loadingStage1: 'Identifying major stories…',
    loadingReady: 'Ready!',
    loadingAlmost: 'Almost there…',
    loadingNote: 'Pre-generating all perspectives so navigation is instant',
    loadingTagline: 'Left · Right · and everything in between',
    loadingSwipeTopics: 'Swipe up / down to browse topics',
    loadingSwipePerspective: 'Swipe left / right to shift perspective',
    // following drawer
    liveLabel: '● LIVE',
    ongoingStories: 'Ongoing Stories',
    noOngoingStories: 'No ongoing stories tracked yet — check back after the next refresh.',
    clearFilter: 'Clear filter — show all stories',
    cards: 'cards', card: 'card', sources: 'sources',
    // app error/empty states
    somethingWrong: 'Something went wrong',
    tryAgain: 'Try Again',
    noTopicsFound: 'No topics found',
    noTopicsMsg: "Couldn't identify major stories right now.",
    refresh: 'Refresh',
    noTopicsWindow: 'No topics in this window yet.',
    expandWindow: 'Expand to 72 Hours',
    // menu
    menu: 'Menu', language: 'Language',
  },
  es: {
    all: 'Todo', hot: '🔥 Tendencias', follow: 'Seguir',
    politics: 'Política', usPolitics: 'Política EE.UU.', world: 'Mundo',
    policy: 'Políticas', economy: 'Economía', nationalSecurity: 'Seguridad Nacional',
    elections: 'Elecciones', technology: 'Tecnología', health: 'Salud',
    sportsCulture: 'Deporte y Cultura', entertainment: 'Entretenimiento',
    liberal: 'Progresista', conservative: 'Conservador', neutral: 'Neutral',
    fan: 'Aficionado', business: 'Negocios',
    optimist: 'Optimista', industry: 'Industria',
    progressive: 'Progresista', traditional: 'Tradicional',
    loadingStage0: 'Obteniendo titulares de hoy…',
    loadingStage1: 'Identificando historias principales…',
    loadingReady: '¡Listo!', loadingAlmost: 'Casi listo…',
    loadingNote: 'Generando todas las perspectivas para una navegación instantánea',
    loadingTagline: 'Izquierda · Derecha · y todo lo demás',
    loadingSwipeTopics: 'Desliza arriba / abajo para explorar temas',
    loadingSwipePerspective: 'Desliza izquierda / derecha para cambiar perspectiva',
    liveLabel: '● EN VIVO', ongoingStories: 'Historias en curso',
    noOngoingStories: 'No hay historias en curso todavía.',
    clearFilter: 'Limpiar filtro — ver todas',
    cards: 'artículos', card: 'artículo', sources: 'fuentes',
    somethingWrong: 'Algo salió mal', tryAgain: 'Intentar de nuevo',
    noTopicsFound: 'No se encontraron temas',
    noTopicsMsg: 'No se pudieron identificar las historias principales.',
    refresh: 'Actualizar', noTopicsWindow: 'No hay temas en este período.',
    expandWindow: 'Ampliar a 72 horas',
    menu: 'Menú', language: 'Idioma',
  },
  fr: {
    all: 'Tout', hot: '🔥 Tendances', follow: 'Suivre',
    politics: 'Politique', usPolitics: 'Politique américaine', world: 'Monde',
    policy: 'Politiques', economy: 'Économie', nationalSecurity: 'Sécurité Nationale',
    elections: 'Élections', technology: 'Technologie', health: 'Santé',
    sportsCulture: 'Sport & Culture', entertainment: 'Divertissement',
    liberal: 'Gauche', conservative: 'Droite', neutral: 'Neutre',
    fan: 'Fan', business: 'Business',
    optimist: 'Optimiste', industry: 'Industrie',
    progressive: 'Progressiste', traditional: 'Traditionnel',
    loadingStage0: "Récupération des titres du jour…",
    loadingStage1: 'Identification des grandes histoires…',
    loadingReady: 'Prêt !', loadingAlmost: 'Presque prêt…',
    loadingNote: 'Génération de toutes les perspectives pour une navigation instantanée',
    loadingTagline: 'Gauche · Droite · et tout ce qui est entre les deux',
    loadingSwipeTopics: 'Glissez haut / bas pour parcourir les sujets',
    loadingSwipePerspective: 'Glissez gauche / droite pour changer de perspective',
    liveLabel: '● EN DIRECT', ongoingStories: 'Actualités en cours',
    noOngoingStories: 'Aucune actualité en cours pour le moment.',
    clearFilter: 'Effacer le filtre — tout afficher',
    cards: 'articles', card: 'article', sources: 'sources',
    somethingWrong: "Quelque chose s'est mal passé", tryAgain: 'Réessayer',
    noTopicsFound: 'Aucun sujet trouvé',
    noTopicsMsg: "Impossible d'identifier les principales histoires.",
    refresh: 'Actualiser', noTopicsWindow: 'Aucun sujet dans cette fenêtre.',
    expandWindow: 'Élargir à 72 heures',
    menu: 'Menu', language: 'Langue',
  },
  pt: {
    all: 'Tudo', hot: '🔥 Em Alta', follow: 'Seguir',
    politics: 'Política', usPolitics: 'Política dos EUA', world: 'Mundo',
    policy: 'Políticas', economy: 'Economia', nationalSecurity: 'Segurança Nacional',
    elections: 'Eleições', technology: 'Tecnologia', health: 'Saúde',
    sportsCulture: 'Esporte e Cultura', entertainment: 'Entretenimento',
    liberal: 'Progressista', conservative: 'Conservador', neutral: 'Neutro',
    fan: 'Torcedor', business: 'Negócios',
    optimist: 'Otimista', industry: 'Indústria',
    progressive: 'Progressista', traditional: 'Tradicional',
    loadingStage0: 'Buscando manchetes de hoje…',
    loadingStage1: 'Identificando as principais histórias…',
    loadingReady: 'Pronto!', loadingAlmost: 'Quase lá…',
    loadingNote: 'Gerando todas as perspectivas para navegação instantânea',
    loadingTagline: 'Esquerda · Direita · e tudo mais',
    loadingSwipeTopics: 'Deslize para cima / baixo para navegar pelos tópicos',
    loadingSwipePerspective: 'Deslize para esquerda / direita para mudar de perspectiva',
    liveLabel: '● AO VIVO', ongoingStories: 'Histórias em andamento',
    noOngoingStories: 'Nenhuma história em andamento ainda.',
    clearFilter: 'Limpar filtro — mostrar tudo',
    cards: 'artigos', card: 'artigo', sources: 'fontes',
    somethingWrong: 'Algo deu errado', tryAgain: 'Tentar novamente',
    noTopicsFound: 'Nenhum tópico encontrado',
    noTopicsMsg: 'Não foi possível identificar as principais histórias.',
    refresh: 'Atualizar', noTopicsWindow: 'Nenhum tópico nesta janela.',
    expandWindow: 'Expandir para 72 horas',
    menu: 'Menu', language: 'Idioma',
  },
  de: {
    all: 'Alle', hot: '🔥 Trend', follow: 'Folgen',
    politics: 'Politik', usPolitics: 'US-Politik', world: 'Welt',
    policy: 'Politikfelder', economy: 'Wirtschaft', nationalSecurity: 'Nationale Sicherheit',
    elections: 'Wahlen', technology: 'Technologie', health: 'Gesundheit',
    sportsCulture: 'Sport & Kultur', entertainment: 'Unterhaltung',
    liberal: 'Links', conservative: 'Rechts', neutral: 'Neutral',
    fan: 'Fan', business: 'Wirtschaft',
    optimist: 'Optimist', industry: 'Industrie',
    progressive: 'Progressiv', traditional: 'Traditionell',
    loadingStage0: 'Nachrichten werden geladen…',
    loadingStage1: 'Hauptthemen werden identifiziert…',
    loadingReady: 'Fertig!', loadingAlmost: 'Fast geschafft…',
    loadingNote: 'Alle Perspektiven werden für sofortige Navigation vorgeneriert',
    loadingTagline: 'Links · Rechts · und alles dazwischen',
    loadingSwipeTopics: 'Wischen Sie hoch / runter für Themen',
    loadingSwipePerspective: 'Wischen Sie links / rechts für Perspektiven',
    liveLabel: '● LIVE', ongoingStories: 'Laufende Geschichten',
    noOngoingStories: 'Noch keine laufenden Geschichten.',
    clearFilter: 'Filter löschen — alle anzeigen',
    cards: 'Artikel', card: 'Artikel', sources: 'Quellen',
    somethingWrong: 'Etwas ist schiefgelaufen', tryAgain: 'Erneut versuchen',
    noTopicsFound: 'Keine Themen gefunden',
    noTopicsMsg: 'Hauptgeschichten konnten nicht identifiziert werden.',
    refresh: 'Aktualisieren', noTopicsWindow: 'Keine Themen in diesem Zeitfenster.',
    expandWindow: 'Auf 72 Stunden erweitern',
    menu: 'Menü', language: 'Sprache',
  },
  ar: {
    all: 'الكل', hot: '🔥 الأكثر رواجاً', follow: 'متابعة',
    politics: 'السياسة', usPolitics: 'السياسة الأمريكية', world: 'العالم',
    policy: 'السياسات', economy: 'الاقتصاد', nationalSecurity: 'الأمن القومي',
    elections: 'الانتخابات', technology: 'التكنولوجيا', health: 'الصحة',
    sportsCulture: 'الرياضة والثقافة', entertainment: 'الترفيه',
    liberal: 'يسار', conservative: 'يمين', neutral: 'محايد',
    fan: 'مشجع', business: 'أعمال',
    optimist: 'متفائل', industry: 'صناعة',
    progressive: 'تقدمي', traditional: 'تقليدي',
    loadingStage0: 'جلب عناوين اليوم…',
    loadingStage1: 'تحديد القصص الرئيسية…',
    loadingReady: 'جاهز!', loadingAlmost: 'لحظات…',
    loadingNote: 'توليد جميع وجهات النظر للتنقل الفوري',
    loadingTagline: 'يسار · يمين · وكل ما بينهما',
    loadingSwipeTopics: 'اسحب لأعلى / أسفل لتصفح المواضيع',
    loadingSwipePerspective: 'اسحب لليسار / اليمين لتغيير المنظور',
    liveLabel: '● مباشر', ongoingStories: 'القصص الجارية',
    noOngoingStories: 'لا توجد قصص جارية حتى الآن.',
    clearFilter: 'إزالة الفلتر — عرض الكل',
    cards: 'مقالات', card: 'مقالة', sources: 'مصادر',
    somethingWrong: 'حدث خطأ ما', tryAgain: 'حاول مجدداً',
    noTopicsFound: 'لم يتم العثور على مواضيع',
    noTopicsMsg: 'تعذر تحديد القصص الرئيسية.',
    refresh: 'تحديث', noTopicsWindow: 'لا توجد مواضيع في هذه الفترة.',
    expandWindow: 'توسيع إلى 72 ساعة',
    menu: 'القائمة', language: 'اللغة',
  },
  zh: {
    all: '全部', hot: '🔥 热门', follow: '关注',
    politics: '政治', usPolitics: '美国政治', world: '世界',
    policy: '政策', economy: '经济', nationalSecurity: '国家安全',
    elections: '选举', technology: '科技', health: '健康',
    sportsCulture: '体育与文化', entertainment: '娱乐',
    liberal: '左派', conservative: '右派', neutral: '中立',
    fan: '球迷', business: '商业',
    optimist: '乐观者', industry: '业界',
    progressive: '进步派', traditional: '传统派',
    loadingStage0: '正在获取今日头条…',
    loadingStage1: '正在识别主要新闻…',
    loadingReady: '准备好了！', loadingAlmost: '即将完成…',
    loadingNote: '正在预生成所有观点以实现即时导航',
    loadingTagline: '左翼 · 右翼 · 及其之间',
    loadingSwipeTopics: '上下滑动浏览话题',
    loadingSwipePerspective: '左右滑动切换视角',
    liveLabel: '● 实时', ongoingStories: '持续关注',
    noOngoingStories: '暂无持续关注的故事。',
    clearFilter: '清除筛选 — 显示全部',
    cards: '篇', card: '篇', sources: '个来源',
    somethingWrong: '出了些问题', tryAgain: '重试',
    noTopicsFound: '未找到话题',
    noTopicsMsg: '暂时无法识别主要新闻。',
    refresh: '刷新', noTopicsWindow: '此时间段内无话题。',
    expandWindow: '扩展至72小时',
    menu: '菜单', language: '语言',
  },
};

// t(key, lang) — look up a translation key, fallback to English
export function t(key, lang = 'en') {
  return T[lang]?.[key] ?? T.en[key] ?? key;
}

// Translate a category string (as stored in topics) to the UI language
const CAT_KEY_MAP = {
  'All': 'all', 'Politics': 'politics', 'US Politics': 'usPolitics',
  'World': 'world', 'Policy': 'policy', 'Economy': 'economy',
  'National Security': 'nationalSecurity', 'Elections': 'elections',
  'Technology': 'technology', 'Health': 'health',
  'Sports & Culture': 'sportsCulture', 'Entertainment': 'entertainment',
};
export function tCat(cat, lang) {
  const key = CAT_KEY_MAP[cat];
  return key ? t(key, lang) : cat;
}
