// 지원서 화면의 칸을 찾아 내 정보로 채우는 엔진.
// 이 파일은 네트워크 요청을 하지 않고, 제출 버튼을 누르지 않습니다.
// 사용: window.__pubFill(profile, { overwrite:false })  /  window.__pubScan()
(function () {
  // 버전이 같을 때만 다시 불러오지 않음 (확장을 고친 뒤에는 페이지 새로고침 없이도 새 엔진 사용)
  const ENGINE = '0.5.98';
  if (window.__pubFillLoaded === ENGINE) return;
  window.__pubFillLoaded = ENGINE;
  const { SCALAR, LISTS } = window.PUBFILL_SCHEMA;
  const SCALAR_FIELDS = SCALAR.flatMap(g => g.fields);
  const SKIP = ['주민등록', '주민번호', '자격요건', '인증번호', '인증', '비밀번호', 'password', 'captcha', '보안문자', '자기소개', '지원동기', '성장과정', '입사후', '포부', '검색', 'search', '아이디', '로그인'];
  const READONLY_OK = new Set(['zip', 'address1', 'address2']);

  const norm = s => (s || '').toLowerCase().replace(/[\s*:：·※\u200b-\u200d\ufeff]/g, '').replace(/필수|선택입력/g, '');
  const textOf = el => (el ? (el.innerText || el.textContent || '') : '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';

  // ---------- 칸 옆 글자(설명) 찾기 ----------
  function cellText(cell) {
    // 칸 안의 입력 요소·선택지 글자는 빼고 순수 제목 글자만
    const c = cell.cloneNode(true);
    c.querySelectorAll('input,select,textarea,option,button,script,style').forEach(n => n.remove());
    return textOf(c);
  }

  // 버튼형 선택지처럼 칸 옆에 글자가 없을 때: 위쪽 조상들의 바로 앞 제목 글자
  function groupTitle(el, maxLen = 20) {
    let node = el, depth = 0;
    while (node && node !== document.body && depth < 6) {
      let p = node.previousElementSibling, hop = 0;
      while (p && hop < 3) {
        if (!p.querySelector('input,select,textarea,button')) { const t = cellText(p).replace(/[\[\]\u200b-\u200d\ufeff]/g, '').trim(); if (t && norm(t) && t.length <= maxLen) return t; }
        p = p.previousElementSibling; hop++;
      }
      node = node.parentElement; depth++;
    }
    return '';
  }

  function precedingText(el) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    w.currentNode = el;
    for (let i = 0; i < 20; i++) {
      const n = w.previousNode();
      if (!n) break;
      const pe = n.parentElement;
      if (!pe || pe.closest('script,style,option,button,select,textarea')) continue;
      const t = n.textContent.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 30 && !/^[*:·\-]+$/.test(t) && norm(t)) return t;
    }
    return '';
  }

  function describe(el) {
    const parts = [];
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && el.type !== 'radio' && el.type !== 'checkbox') parts.push(textOf(l));
    }
    const wrap = el.closest('label');
    if (wrap && el.type !== 'radio' && el.type !== 'checkbox') parts.push(cellText(wrap));
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(id => { const n = document.getElementById(id); if (n) parts.push(textOf(n)); });
    if (el.title) parts.push(el.title);
    // 구글 설문: 칸 이름이 '날짜'뿐이면 질문 제목(heading)을 붙임
    const gq = el.closest('[role="listitem"]');
    if (gq) { const h = gq.querySelector('[role="heading"]'); if (h) parts.unshift(textOf(h)); }

    // 표: 같은 줄 앞쪽 제목칸(th) + 같은 열 머리글
    const td = el.closest('td');
    if (td) {
      let p = td.previousElementSibling;
      while (p) {
        if (p.tagName === 'TH' || (!p.querySelector('input,select,textarea') && textOf(p).length < 30)) { parts.push(cellText(p)); break; }
        p = p.previousElementSibling;
      }
      const table = td.closest('table');
      const tr = td.parentElement;
      if (table && tr) {
        const idx = colIndex(td);
        const headRow = table.querySelector('thead tr') || [...table.rows].find(r => r !== tr && r.querySelector('th') && !r.querySelector('input,select,textarea'));
        if (headRow) {
          const h = cellAtCol(headRow, idx);
          if (h) parts.push(cellText(h));
        }
      }
    }
    const th = el.closest('th');
    if (th) parts.push(cellText(th));
    // 정의 목록
    const dd = el.closest('dd');
    if (dd && dd.previousElementSibling && dd.previousElementSibling.tagName === 'DT') parts.push(textOf(dd.previousElementSibling));
    // 바로 앞 글자 조각 ("입대일 <input>")
    let tn = el.previousSibling;
    while (tn && tn.nodeType === 3 && !tn.textContent.trim()) tn = tn.previousSibling;
    if (tn && tn.nodeType === 3) { const t = tn.textContent.trim().split(/[~\n]/).pop().trim(); if (t && t.length < 20) parts.push(t); }
    // 바로 앞 글자 (span, strong, p 등)
    let prev = el.previousElementSibling, hop = 0;
    while (prev && hop < 3) {
      if (!prev.matches('input,select,textarea,button,br')) { const t = cellText(prev); if (t && t.length < 30) { parts.push(t); break; } }
      prev = prev.previousElementSibling; hop++;
    }
    if (!parts.join('').trim() && el.parentElement) {
      // 부모 묶음(div.row 등)의 제목
      const box = el.parentElement.closest('div,li,p,fieldset');
      if (box) { const t = cellText(box); if (t.length < 40) parts.push(t); }
    }
    // 이름표가 입력칸 부모의 형제로 따로 있는 구조(MUI 등)
    if (!parts.join('').trim()) { const g = groupTitle(el, 30); if (g) parts.push(g); }
    // 마지막 수단: 문서 순서상 바로 앞에 있는 글자
    if (!parts.join('').trim()) { const t = precedingText(el); if (t) parts.push(t); }
    if (el.placeholder) parts.push(el.placeholder);
    if (el.type === 'radio') { const g = groupTitle(el.closest('label') || el); if (g) parts.push(g); }
    return parts.filter(Boolean).join(' | ');
  }

  function colIndex(cell) {
    let i = 0, c = cell.parentElement.firstElementChild;
    while (c && c !== cell) { i += c.colSpan || 1; c = c.nextElementSibling; }
    return i;
  }
  function cellAtCol(row, idx) {
    let i = 0;
    for (const c of row.children) { const span = c.colSpan || 1; if (idx >= i && idx < i + span) return c; i += span; }
    return null;
  }

  // ---------- 화면 구역(학력·자격증 등) 찾기 ----------
  const HEAD_SEL = 'h1,h2,h3,h4,h5,h6,caption,legend,strong,b,dt,[role="heading"],[class*="tit"],[class*="Tit"],[class*="head"],[class*="subject"]';
  function listForHeading(t) {
    const n = norm(t);
    if (!n || n.length > 30) return undefined;
    // 공고 제목('… 경력 모집', '[○○그룹] 신입 채용')은 구역 제목이 아님 → 구역 해제
    if (/모집|채용|공고|^\[/.test(n)) return null;
    for (const l of LISTS) if (l.section.some(k => n.includes(norm(k)))) return l.key;
    return null; // 다른 제목(인적사항 등)이 나오면 구역 해제
  }
  function sectionMap(controls) {
    const map = new Map();
    const set = new Set(controls);
    let cur = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (set.has(node)) map.set(node, cur);
      else if (node.matches && node.matches(HEAD_SEL) && !node.querySelector('input,select,textarea')) {
        const k = listForHeading(textOf(node));
        if (k !== undefined) cur = k;
      }
      node = walker.nextNode();
    }
    return map;
  }

  // 값은 읽지 않고, 칸의 속성·설명·구역·화면 순서만으로 안정적인 식별값을 만듭니다.
  function identityBase(el, label, section) {
    const radio = el.type === 'radio';
    const fieldLabel = radio
      ? (el.name ? '' : (groupTitle(el.closest('label') || el, 160) || label))
      : label;
    return JSON.stringify([
      radio ? 'radio-group' : (el.getAttribute('role') || el.tagName.toLowerCase()),
      radio ? 'radio' : (el.type || ''),
      el.name || '',
      radio ? '' : (el.id || ''),
      norm(fieldLabel),
      section || ''
    ]);
  }
  function fingerprintIndex(els, labelOf, sectionOf) {
    const counts = new Map(), result = new Map();
    for (const el of els) {
      const base = identityBase(el, labelOf(el), sectionOf(el));
      // 라디오 선택지 여러 개는 하나의 질문 칸으로 취급합니다.
      let ordinal = counts.get(base) || 0;
      if (el.type === 'radio') {
        if (result.has(el.name + '\u0000' + base)) {
          result.set(el, result.get(el.name + '\u0000' + base));
          continue;
        }
        const fp = JSON.stringify([base, ordinal]);
        result.set(el.name + '\u0000' + base, fp);
        for (const r of els) if (r.type === 'radio' && identityBase(r, labelOf(r), sectionOf(r)) === base) result.set(r, fp);
        counts.set(base, ordinal + 1);
      } else {
        result.set(el, JSON.stringify([base, ordinal]));
        counts.set(base, ordinal + 1);
      }
    }
    return result;
  }
  function mappedField(path) {
    if (typeof path !== 'string') return null;
    const bits = path.split('.');
    if (bits.length === 1) {
      const field = SCALAR_FIELDS.find(f => f.key === bits[0]);
      return field ? { list: null, field } : null;
    }
    if (bits.length === 2) {
      const list = LISTS.find(l => l.key === bits[0]);
      const field = list && list.fields.find(f => f.key === bits[1]);
      return field ? { list: list.key, field } : null;
    }
    return null;
  }
  function mappingFor(fp, fieldMappings) {
    const path = fp && fieldMappings && fieldMappings[fp];
    return mappedField(path);
  }
  // 사용자가 '이 칸은 건너뛰기'로 알려 준 칸
  const isUserSkip = (fp, fieldMappings) => !!(fp && fieldMappings && fieldMappings[fp] === '__skip__');
  // 알려 주기로도 절대 채우지 않는 칸 (주민번호·비밀번호·인증번호 등)
  const HARD_SKIP = ['주민등록', '주민번호', '인증번호', '비밀번호', 'password', 'captcha', '보안문자'];
  const isHardSkip = desc => HARD_SKIP.some(k => norm(desc).includes(norm(k)));
  let curMappings = {}; // 이번 채우기에서 쓰는 이 사이트의 연결
  // 버튼형 목록·버튼 묶음 지문 (값이 아니라 칸 모양으로만 만듦)
  const fpDropdown = btn => JSON.stringify(['dropdown', norm(textOf(btn)).slice(0, 40), norm(groupTitle(btn, 30))]);
  const fpButtons = (p, bs) => JSON.stringify(['buttons', bs.map(b => norm(textOf(b))).join('/'), norm(groupTitle(p))]);


  // 칸 내부 이름(마지막 마디) → 내 정보 항목. 그리팅은 회사가 달라도 이름이 같아 한 번 배우면 모든 회사에 적용됨
  const NAME_HINTS = {
    hobby: 'hobby', specialskill: 'talent', colorblindness: 'colorBlind', applicationsource: 'applySource',
    totalcreditsearned: 'education.credits', maincampusbranchcampus: 'education.campus',
    department: 'career.dept', annualsalary: 'career.salary', previoussalary: 'career.salary', reasonforresignation: 'career.reason', positionrank: 'career.position',
    foreignlanguage: 'languages.language', conversationalproficiency: 'languages.speak', writingproficiency: 'languages.write', readingproficiency: 'languages.read',
    programname: 'trainings.name', traininghours: 'trainings.hours',
    projectname: 'projects.name', client: 'projects.client', roleparticipationrole: 'projects.role', contribution: 'projects.share', projectdescription: 'projects.desc',
    awardname: 'awards.name', awardinginstitution: 'awards.org', awarddate: 'awards.date', awarddetail: 'awards.desc',
    institutionorganizationname: 'activities.org', activityclassification: 'activities.type', activityperiod: 'activities.start', activitydescription: 'activities.desc',
    referrername: 'referrerName', relationshiptoreferrer: 'referrerRelation', referrerorganization: 'referrerOrg',
    researchfield: 'education.research', academicadviser: 'education.advisor',
    purposeofoverseasexperience: 'overseas.purpose', periodofoverseasexperience: 'overseas.period', completionperiod: 'trainings.start', servicecategory: 'activities.type',
    skillcategory: 'skills.category', skilllevel: 'skills.level',
  };
  function nameHint(el) {
    const nm = (el.name || '').toLowerCase(); if (!nm) return null;
    const segs = nm.split('.').filter(x => !/^\d+$/.test(x));
    const last = segs[segs.length - 1] || '';
    if (last === 'salary' && /desiredsalary/.test(nm)) return mappedField('desiredSalary');
    // 기간 칸: 앞 마디(재학·근무·복무 기간) + startDate/endDate
    const prev = segs[segs.length - 2] || '';
    if (last === 'role' && /extracurricular|activit/.test(nm)) return mappedField('activities.role');
    if (/^(start|end)date$/.test(last)) {
      const s0 = last === 'startdate';
      if (prev === 'enrollmentperiod') return mappedField(s0 ? 'education.start' : 'education.end');
      if (prev === 'employmentperiod') return mappedField(s0 ? 'career.start' : 'career.end');
      if (prev === 'serviceperiod') return mappedField(s0 ? 'militaryStart' : 'militaryEnd');
      if (prev === 'projectperiod') return mappedField(s0 ? 'projects.start' : 'projects.end');
    }
    return NAME_HINTS[last] ? mappedField(NAME_HINTS[last]) : null;
  }

  // ---------- 항목 맞추기 ----------
  function scoreField(f, d) {
    if (f.ex && f.ex.some(x => d.includes(norm(x)))) return 0;
    if (f.needWith && !d.includes(norm(f.needWith))) return 0;
    let best = 0;
    for (const k of f.kw) { const nk = norm(k); if (d.includes(nk)) best = Math.max(best, nk.length); }
    return best;
  }
  // 칸 내부 이름(영문)이 분명하면 글자 설명보다 먼저 판단 (recruiter 계열 사이트 등)
  const ATTR_LIST = {
    education: { region: /location|region|sido|area_?code/, track: /category|affiliation|series|track/, dayNight: /day_?or_?night|daynight/, admission: /admission_?(type|kind|cd|code)|entr\w*_?(type|kind)|transfer/, school: /school_?(name|nm)\b|schoolname/, major: /major/, start: /entrance|admission_?date|start_?date|str_?yymm/, end: /graduation_?date|end_?date|end_?yymm/, status: /graduation_?type|graduation_?status|gradu_?type/, degree: /degree/, gpaMax: /(^|_)credit$|scale/, gpa: /\bgpa\b|grade_?point|score\b|sch_?point/ },
    certificates: { grade: /rating|grade|level/, issuer: /issu|agency|publisher|inst_?nm/, date: /acqu|_dt\b|date/, number: /cert\w*_?(no|num)|licen\w*_?(no|num)|credential_?(no|num)/ },
    languages: { score: /score|rating|grade/, number: /exam_?(no|num)|test_?(no|num)/ },
    career: { type: /criteria|employ\w*type|career_?type|employee_?type/, company: /company|corp/, dept: /dept|department/, position: /position|rank/, start: /start_?date|join_?date|str_?(yymm|dt)/, end: /end_?date|leave_?date|resign|end_?(yymm|dt)/ },
  };
  function attrList(el) {
    const a = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    // 그리팅식 이름(languagesCertifications….certificatesLicenses.0.rating)은 두 번째 마디로 판단
    const seg = (el.name || '').includes('.') ? (el.name.split('.')[1] || '').toLowerCase() : '';
    const list = seg ? (/language/.test(seg) ? 'languages' : /certificat|licen/.test(seg) ? 'certificates' : null)
      : null;
    if (list) { const a2 = (el.name.split('.').pop() || '').toLowerCase(); for (const [key, re] of Object.entries(ATTR_LIST[list])) if (re.test(a2)) { const f = LISTS.find(l => l.key === list).fields.find(x => x.key === key); if (f) return { list, field: f, score: 50 }; } return null; }
    // 일반 이름(CJ 등 zz_*) 보강: 경력 → 자격증 → 학력 순으로 판단
    const list0 = (/career|company|employee|position|salary|workexperience|(^|_)work(_|$)/.test(a) && !/milit|army|desiredsalary/.test(a)) ? 'career'
      : /certificat|(^|_)lic_|(^|_)inst_?nm/.test(a) ? 'certificates'
      : /highschool|college|graduate|univ|education|school|major|sch_?point|gradu|(^|_)credit$|(^|_)(str|end)_?yymm/.test(a) ? 'education' : null;
    if (!list0) return null;
    for (const [key, re] of Object.entries(ATTR_LIST[list0])) if (re.test(a)) {
      const list = list0; const f = LISTS.find(l => l.key === list).fields.find(x => x.key === key);
      if (f) return { list, field: f, score: 50 };
    }
    return null;
  }
  function match(el, desc, section) {
    const d = norm(desc);
    const attr = norm((el.name || '') + ' ' + (el.id || ''));
    // Greenhouse 이름 칸: 한국어 법적 이름은 SCALAR name, Preferred First Name은 영문 nameEn.
    // 라벨 판정을 속성 힌트보다 먼저 해 Legal First Name (Korean)이 영문 이름으로 분류되지 않게 함.
    if (/legalfirstname.*korean|legallastname.*korean/.test(d)) {
      const field = SCALAR_FIELDS.find(f => f.key === 'name');
      if (field) return { list: null, field, score: 100 };
    }
    // Ashby 'Preferred Name (if applicable)': 영문 이름 전체
    if (/preferredname/.test(d) && !/preferred(first|last)name|pronoun/.test(d)) {
      const field = SCALAR_FIELDS.find(f => f.key === 'nameEn');
      if (field) return { list: null, field, score: 100 };
    }
    if (/preferredfirstname/.test(d)) {
      const field = SCALAR_FIELDS.find(f => f.key === 'nameEn');
      if (field) return { list: null, field, score: 100 };
    }
    if (el.tagName === 'INPUT' && (/^postcodify_/i.test(el.name || '') || /^postcodify_/i.test(el.id || '') || el.matches('.postcodify_search_controls input.keyword'))) {
      return { list: null, field: { key: 'postcodifySearch', type: 'search', label: '우편번호 검색어' }, score: 100 };
    }
    // Ashby 'Location' 검색형 칸: 거주 도시를 넣고 뜨는 목록에서 같은 도시를 골라야 저장됨
    if (el.tagName === 'INPUT' && el.getAttribute('role') === 'combobox' && el.closest('[data-field-path="_systemfield_location"]')) {
      const field = SCALAR_FIELDS.find(x => x.key === 'city');
      if (field) return { list: null, field, score: 100 };
    }
    // 학교 검색 칸: 학교명을 넣고 Enter (결과에서 고르는 것은 사용자)
    if (el.tagName === 'INPUT' && (el.type === 'search' || /학교검색|학교명검색/.test(d)) && (section === 'education' || /학교/.test(d))) return { list: 'education', field: { key: 'schoolSearch', type: 'search', label: '학교 검색' }, score: 60 };
    const byAttr = el.tagName !== 'TEXTAREA' && attrList(el);
    if (byAttr) return byAttr;
    if ((el.tagName === 'SELECT' || el.type === 'radio') && /비수도권/.test(d) && /지역인재/.test(d)) {
      const field = SCALAR_FIELDS.find(x => x.key === 'localTalent');
      if (field) return { list: null, field, score: 100 };
    }
    // 선택지 글자만 있는 경력 연차 라디오(1년 미만/1~2년/2~5년/직접입력). 회사별 예/아니오 질문은 여기에 넣지 않음
    if (el.type === 'radio' && /1년미만/.test(d) && /직접입력/.test(d)) {
      const field = LISTS.find(l => l.key === 'career').fields.find(f => f.key === 'years');
      if (field) return { list: 'career', field, score: 100 };
    }
    {
      const an = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
      const F = k => SCALAR_FIELDS.find(f => f.key === k);
      const hint = nameHint(el); if (hint) return { ...hint, score: 96 };
      if (/^country$/i.test(el.id || '') && el.matches('input[role="combobox"]')) { const f = F('nationality'); if (f) return { list: null, field: f, score: 96 }; }
      // Ashby: 성명 한 칸(_systemfield_name, Name/Legal Name)은 해외 지원서라 영문 성명. 전화 칸(type=tel, Phone)은 휴대폰
      if (el.tagName === 'INPUT' && /^_systemfield_name$/.test(el.name || el.id || '')) { const f = F('nameEn'); if (f) return { list: null, field: f, score: 96 }; }
      if (el.tagName === 'INPUT' && el.type === 'tel' && /phone/.test(d) && !/emergency|home|work|office|비상|긴급|자택|회사/.test(d)) { const f = F('phone'); if (f) return { list: null, field: f, score: 96 }; }
      if (el.type === 'radio' && /army|milit/.test(an) && !/vet|dis/.test(an)) return { list: null, field: F('military'), score: 95 };
      if (el.type === 'radio' && el.name) { const o2 = norm([...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)].map(r => textOf((r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)) || r.closest('label') || r.parentElement)).join('|')); if (/경력있음/.test(o2) && /경력없음|신입/.test(o2) || /^신입\|경력$|^경력\|신입$/.test(o2)) return { list: null, field: F('careerStatus'), score: 95 }; }
      // 지원경로 질문: 보기에 잡코리아·사람인·인크루트 같은 채용 사이트 이름이 있는 라디오 묶음 (그리팅 추가질문 8곳)
      if (el.type === 'radio' && el.name) { const opts = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)].map(r => { const l = (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)) || r.closest('label'); return textOf(l || r.parentElement); }).join(' '); if ((opts.match(/잡코리아|사람인|인크루트|링커리어|원티드|캐치|자소설/g) || []).length >= 2) return { list: null, field: F('applySource'), score: 95 }; }
      if (el.tagName === 'INPUT' && el.type !== 'radio' && /army_?(str|start)/.test(an)) return { list: null, field: F('militaryStart'), score: 95 };
      if (el.tagName === 'INPUT' && el.type !== 'radio' && /army_?end/.test(an)) return { list: null, field: F('militaryEnd'), score: 95 };
      if (el.tagName === 'INPUT' && /last_?name|family_?name|surname|first_?name|given_?name/.test(an))
        return { list: null, field: F(/eng/.test(an) ? 'nameEn' : 'name'), score: 95 };
      // 이메일 아이디 칸 (CJ 등: email_id). '아이디' 금지어는 로그인 아이디용이라 여기서는 예외
      if (el.tagName === 'INPUT' && (/(^|[^a-z])e?mail_?(id|local)\b/.test(an) || /이메일아이디|메일id/.test(d))) return { list: null, field: F('email'), score: 95 };
    }
    if (SKIP.some(s => d.includes(norm(s)))) return { skip: true };
    // 칸 안 안내글이 날짜 항목 이름 그대로면(입대일·제대일 등) 그 항목으로 확정. 근처 오류 문구('복무기간을 입력해주세요')에 끌려 기간으로 오인식하는 것 방지
    const ph = norm(el.placeholder || '');
    if (ph && el.tagName === 'INPUT') {
      const exact = SCALAR_FIELDS.find(f => (f.type === 'date' || f.type === 'month') && f.kw.some(k => norm(k) === ph));
      if (exact) return { list: null, field: exact, score: 90 };
    }
    let best = null;
    const isChoice = el.tagName === 'SELECT' || el.type === 'radio';
    const consider = (cand, score) => {
      if (cand.field.type === 'period' && isChoice) return; // 기간 쌍은 날짜 칸에만
      if (cand.field.type === 'period' && /입대|전역|제대|입학|졸업|입사|퇴사|시작일|종료일/.test(d)) return; // '입대일자'처럼 한쪽 날짜면 기간 칸 아님
      if (score > 0 && (!best || score > best.score)) best = { ...cand, score };
    };
    const phN = el.tagName !== 'SELECT' ? norm(el.placeholder || '') : '';
    // 1) 해당 구역의 여러 줄 항목
    for (const l of LISTS) {
      if (section && section !== l.key) continue;
      for (const f of l.fields) {
        let s = scoreField(f, d);
        if (!section && s < 3) s = 0; // 구역을 모를 때는 '자격증명'처럼 분명한 단어만
        // 구역 안에서는 칸 안 안내글(나인하이어: 회사명·입사일·직급/직책·근무부서)이 묶음 제목('고용형태' 등)보다 정확함
        if (phN && (!section || section === l.key)) { const sp = scoreField(f, phN); if (sp >= 2) s = Math.max(s, sp + 6); }
        consider({ list: l.key, field: f }, s + (section ? 10 : 0));
      }
    }
    // 2) 단일 항목
    for (const f of SCALAR_FIELDS) consider({ list: null, field: f }, scoreField(f, d));
    if (!best && (el.tagName === 'SELECT' || el.type === 'radio')) {
      // 3) "기초생활 수급자 여부(…)"처럼 위쪽에 긴 질문 문장이 있는 선택형 칸
      const q = norm(groupTitle(el.closest('label') || el, 160));
      for (const f of SCALAR_FIELDS) if (f.type === 'select') consider({ list: null, field: f }, scoreField(f, q));
      if (best) best.fromQuestion = true;
    }
    if (!best) {
      // 4) name/id 속성 (영문 이름만)
      const ATTR = { militaryStart: /milit\w*start|enlist|mil\w*_?s(tart)?_?d(ate|t)/, militaryEnd: /milit\w*end|discharge_?d(ate|t)|mil\w*_?e(nd)?_?d(ate|t)/, militaryRank: /milit\w*(rank|position)/, militarySpecialty: /militaryrole|milit\w*special/, militaryBranch: /milit\w*branch/, militaryDischarge: /discharge(code|type)/, name: /^(user)?(kor)?name$|^nm$|kor_?nm/, nameHanja: /chinese_?name|hanja_?name|hanmun_?name/, email: /e?mail/, phone: /hp|mobile|cell|phone/, birth: /birth|brth/, zip: /zip|post/, nameEn: /eng.?n(a)?m|english_?name|name_?en(g)?\b/ };
      for (const [key, re] of Object.entries(ATTR)) if (re.test(attr)) { const f = SCALAR_FIELDS.find(x => x.key === key); return { list: null, field: f, score: 1 }; }
    }
    return best;
  }

  // ---------- 값 넣기 ----------
  const nativeSet = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  };
  function finishInput(el) {
    // React/Vue 폼이 input/change를 상태로 반영한 뒤 검증하도록 keyup·blur를 다음 짧은 구간으로 미룹니다.
    setTimeout(() => {
      if (!el.isConnected) return;
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }, 60);
  }
  function fire(el) {
    ['input', 'change'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    finishInput(el);
  }
  // 칸에 커서가 들어온 동안만 검사 타이머를 돌려 '통과' 표시를 남기는 사이트(recruiter.co.kr 코스트코 성명·휴대전화 등):
  // 값을 넣은 뒤 커서가 들어온 신호(focus)를 보내고 잠시 뒤 나간 신호(blur)를 보내 검사가 한 번 돌게 함.
  // 달력·검색형 목록은 커서가 들어오면 창이 열리므로 제외
  const FOCUS_TYPES = new Set(['text', 'email', 'tel', 'search', 'password', '']);
  const dateLike = el => /date|yyyy|yymm|ymd|birth|calendar|picker|년|월|일자|날짜/i.test([el.name, el.id, el.placeholder, el.className].join(' '));
  function focusPulse(el) {
    if (el.tagName !== 'INPUT' || !FOCUS_TYPES.has((el.getAttribute('type') || '').toLowerCase()) || el.readOnly) return;
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') || el.closest('[data-scope]') || dateLike(el)) return;
    // finishInput의 blur(60ms 뒤)가 지난 다음에 들어와야 검사 타이머가 꺼지지 않음
    setTimeout(() => {
      if (!el.isConnected) return;
      try { el.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); } catch (e) { return; }
      setTimeout(() => { try { el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); } catch (e) {} }, 350);
    }, 120);
  }
  function setText(el, v) { nativeSet(el, String(v)); fire(el); focusPulse(el); return true; }
  // ── 자격증·어학 별칭 매칭 ──
  const n2 = s => norm(s).replace(/[()\[\]{}\-_/&+.,'"“”]/g, '');
  const GRADE = /(심화|기본)?\s*([1-9])\s*급|\b(N[1-5])\b|(level|레벨)\s*([1-9])/i;
  function splitGrade(v) {
    const m = String(v || '').match(GRADE);
    if (!m) return { base: String(v || '').trim(), grade: '' };
    const grade = m[2] ? m[2] + '급' : (m[3] ? m[3].toUpperCase() : (m[5] ? 'Level ' + m[5] : ''));
    return { base: String(v).replace(m[0], '').replace(/[()\s]+$/, '').trim(), grade };
  }
  const ALIAS = (window.PUBFILL_ALIAS || []).map(([canon, al]) => ({ canon, al: al.map(n2).filter(Boolean) }));
  // Q-Net 국가자격 종목명도 공식 명칭으로 사용 (별칭 목록에 없는 종목)
  for (const [n] of (window.PUBFILL_QNET || [])) { const a = n2(n); if (a.length >= 4 && !ALIAS.some(e => e.al.includes(a))) ALIAS.push({ canon: n, al: [a] }); }
  function canonOf(text) {
    const t = n2(splitGrade(text).base) || n2(text);
    if (!t) return null;
    // 1) 정확히 같은 표기 우선  2) 표기 안에 별칭이 들어 있으면 가장 긴 별칭
    for (const e of ALIAS) if (e.al.includes(t)) return e.canon;
    let best = null, len = 0;
    for (const e of ALIAS) for (const a of e.al) {
      if (a.length >= 3 && t.includes(a) && a.length > len) { best = e.canon; len = a.length; }
    }
    return best;
  }
  // 목록에서 같은 시험(별칭 포함)을 고르고, 등급이 있으면 등급까지 맞는 선택지를 우선
  function selectCanon(el, value) {
    const want = canonOf(value);
    if (!want) return false;
    const g = splitGrade(value).grade;
    const opts = [...el.options].filter(o => o.value !== '' && canonOf(o.text) === want);
    if (!opts.length) return false;
    const gn = g && g.match(/\d/) ? Number(g.match(/\d/)[0]) : null;
    const score = o => {
      const t = n2(o.text); let sc = 0;
      if (g && t.includes(n2(g))) sc += 2;
      if (gn && gn <= 3 && t.includes('심화')) sc += 1;
      if (gn && gn >= 4 && t.includes('기본')) sc += 1;
      if (g && /[1-9]급|심화|기본/.test(o.text) && sc === 0) sc -= 1; // 다른 등급
      return sc;
    };
    const o = opts.sort((a, b) => score(b) - score(a))[0];
    el.value = o.value; fire(el); return true;
  }
  // 등급 칸: "1급" 그대로, 없으면 한국사 심화(1~3급)/기본(4~6급)
  function setGrade(el, g) {
    if (el.tagName !== 'SELECT') return setText(el, g);
    if (setSelect(el, g)) return true;
    const n = (g.match(/\d/) || [])[0];
    if (n && setSelect(el, Number(n) <= 3 ? '심화' : '기본')) return true;
    return false;
  }
  // 사이트마다 다른 선택지 표현 (내 정보 값 → 같은 뜻의 선택지들)
  const SYN = [
    ['비대상', '미해당', '해당없음', '해당사항없음', '비해당', '아니오', '아니요', '없음', '무', 'n', 'no'],
    ['대상', '해당', '예', '있음', '유', 'y', 'yes'],
    ['군필', '병역필', '필', '군필자', '만기전역', '전역', '복무완료'],
    ['미필', '병역미필', '미필자', '미복무'],
    ['면제', '병역면제', '군면제'],
    ['복무중', '복무', '군복무중', '재복무'],
    ['남', '남자', '남성', 'm', 'male'],
    ['여', '여자', '여성', 'f', 'female'],
    ['사회복무요원', '공익근무요원', '공익'], ['현역병', '현역'], ['대한민국', '한국', 'korea', 'southkorea', 'korea,republicof', 'republicofkorea'], ['신입', '경력없음', '경력 없음', '해당없음'], ['경력', '경력있음', '경력 있음', '경력자'], ['졸업', '졸업자'], ['졸업예정', '졸업예정자'], ['재학', '재학중'], ['수료', '수료자'], ['신입학', '입학', '일반입학', '신입생'], ['편입학', '편입', '편입생'], ['재입학', '재입생'],
    ['채용사이트', 'external job board', 'external job site', 'job board'],
  ];
  // React 선택 목록 입력칸(react-select). 이미 고른 값이 있으면 빈 칸으로 보지 않음
  const isReactSelect = el => el.tagName === 'INPUT' && el.getAttribute('role') === 'combobox' && !!el.closest('[class*="select__control"], [class*="-control"]') && !el.closest('[data-scope]');
  // Ashby Location처럼 글자를 넣으면 목록(role=option)이 뜨고 그중 하나를 눌러야 저장되는 칸
  const isSearchCombo = el => el.tagName === 'INPUT' && el.getAttribute('role') === 'combobox' && !!el.closest('[data-field-path="_systemfield_location"]');
  const rsChosen = el => { const c = el.closest('[class*="select__control"], [class*="-control"]'); return !!(c && c.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value"]')); };
  function variants(v) {
    const w = norm(String(v));
    const g = SYN.find(list => list[0] === w || list.includes(w));
    return g ? g : [w];
  }
  const NEG = /^(비|미|무|불|해당없|아니)/;
  const optText = x => norm(x.text), optVal = x => norm(x.value);
  function pick(el, o) { if (!o) return false; el.value = o.value; fire(el); return true; }
  function setSelect(el, v) {
    const opts = [...el.options].filter(x => x.value !== '' || norm(x.text));
    const ws = variants(v);
    // 1) 정확히 같은 선택지
    for (const w of ws) { const o = opts.find(x => optText(x) === w || optVal(x) === w); if (o) return pick(el, o); }
    // 2) 숫자 (년·월·일)
    const w0 = ws[0];
    if (/^\d+$/.test(w0)) { const n = Number(w0); return pick(el, opts.find(x => /^\d+$/.test(optVal(x) || optText(x)) && Number(optVal(x) || optText(x)) === n)); }
    // 3) 선택지 글자 안에 값이 들어 있는 경우 ('군필(만기전역)'). 부정형('비대상','미해당')은 값도 부정형일 때만
    for (const w of ws) {
      if (w.length <= 2 && !/[가-힣]{2}/.test(w)) continue;
      const o = opts.find(x => { const t = optText(x); return t && t.includes(w) && (NEG.test(t) === NEG.test(w)); });
      if (o) return pick(el, o);
    }
    return false;
  }
  function isEmpty(el) {
    if (el.tagName === 'SELECT') return el.selectedIndex <= 0 || el.value === '';
    if (isReactSelect(el)) return !rsChosen(el);
    return !el.value;
  }

  function dateParts(v) { const m = String(v).match(/(\d{4})\D?(\d{1,2})?\D?(\d{1,2})?/); return m ? [m[1], m[2] || '', m[3] || ''] : [v]; }
  function formatDate(el, v) {
    const [y, m, d] = dateParts(v);
    if (el.type === 'date') return d ? `${y}-${m}-${d}` : `${y}-${m}-01`;
    if (el.type === 'month') return `${y}-${m}`;
    // 사이트가 속성으로 형식을 알려 주는 경우: recruiter 예전 화면 data-dates="military.militaryDate:YM"(코스트코 복무기간),
    // data-format / data-date-format="yyyy.mm" 등
    // 종료일 칸에는 표시가 없고 짝인 시작일 칸에만 있는 경우가 있어(코스트코), 같은 묶음(위로 3단계, 날짜 칸 2~3개)의 짝 칸 표시를 따름
    // data-dates="묶음이름:형식" — 종료일은 형식 대신 END만 적힌 경우(코스트코 military.militaryDate:END) 같은 묶음 이름의 시작일 칸 형식을 씀
    // data-dates="묶음이름:형식 [다른 설정…]" — 예: "military.militaryDate:YM", "highschoolDate:YM  highschool graduationCriteriaDate".
    // 종료일은 형식 대신 END만 적힌 경우(military.militaryDate:END) 같은 묶음 이름의 다른 칸 형식을 씀
    const parseDates = v => { const m = String(v || '').match(/^\s*([^:\s]+)\s*:\s*([A-Za-z]+)/); return m ? { key: m[1], fmt: m[2].toUpperCase() } : null; };
    const isFmt = f => /^(YM|YMD|Y)$/.test(f);
    const df = (() => {
      const own = parseDates(el.getAttribute('data-dates'));
      if (own && isFmt(own.fmt)) return own.fmt;
      if (own) {
        for (const i of document.querySelectorAll('input[data-dates]')) { if (i === el) continue; const o = parseDates(i.getAttribute('data-dates')); if (o && o.key === own.key && isFmt(o.fmt)) return o.fmt; }
      }
      const rel = el.getAttribute('data-rel-target');
      for (let box = el.parentElement, k = 0; box && k < 3; box = box.parentElement, k++) {
        const ins = [...box.querySelectorAll('input')].filter(i => i.type !== 'hidden');
        if (ins.length > 3) break;
        for (const i of ins) { if (i === el || (rel && i.getAttribute('data-rel-target') && i.getAttribute('data-rel-target') !== rel)) continue; const o = parseDates(i.getAttribute('data-dates')); if (o && isFmt(o.fmt)) return o.fmt; }
      }
      return '';
    })();
    if (df === 'YM') return `${y}.${m}`;
    if (df === 'YMD' && d) return `${y}.${m}.${d}`;
    const fa = (el.getAttribute('data-format') || el.getAttribute('data-date-format') || '').trim();
    if (/^y{2,4}([.\-/]?)m{1,2}$/i.test(fa)) return [y, m].join(fa.match(/^y+([.\-/]?)/i)[1]);
    const ph = el.placeholder || '';
    const ml = el.maxLength > 0 ? el.maxLength : 0;
    const sep = (ph.match(/y{2,4}([.\-/])/i) || ph.match(/\d{4}([.\-/])/) || [])[1];
    const parts = [y, m, d].filter(Boolean);
    if (sep) { const n = (ph.match(/[.\-/]/g) || []).length + 1; return parts.slice(0, n).join(sep); }
    // 이름이 ...Date 인 칸(입학일·졸업일 등)은 일까지 요구하는 경우가 많아, 일이 없으면 1일로 채움
    if (!d && /date|ymd/i.test((el.name || '') + (el.id || '')) && !/ym$|yearmonth|month/i.test((el.name || '') + (el.id || ''))) return [y, m, '01'].join('.');
    if (ml === 8) return parts.join('').padEnd(8, '01');
    if (ml === 6) return y + m;
    if (ml === 4) return y;
    if (ml === 7) return `${y}.${m}`;
    if (ml === 10) return `${y}.${m}.${d || '01'}`;
    return parts.join('.');
  }
  function phoneParts(v) {
    const d = String(v).replace(/\D/g, '');
    if (d.startsWith('02')) return [d.slice(0, 2), d.slice(2, d.length - 4), d.slice(-4)];
    return [d.slice(0, 3), d.slice(3, d.length - 4), d.slice(-4)];
  }

  // 같은 칸 묶음 안의 여러 요소(전화 3칸, 이메일 아이디@도메인, 년/월/일)에 나눠 넣기
  function fillGroup(els, field, value, list) {
    let ok = 0;
    // 여러 칸으로 나뉜 값(이메일 아이디@도메인, 전화 3칸 등)은 칸마다 '입력 끝' 신호를 보내면
    // 사이트가 덜 채워진 상태로 검사해 경고창을 띄움 → 값만 먼저 넣고 마지막에 한꺼번에 신호
    const multi = els.length > 1;
    const pending = [];
    const quiet = (el, v) => { nativeSet(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); pending.push(el); return true; };
    const put = (el, v) => {
      if (v === '' || v == null) return;
      const okSet = el.tagName === 'SELECT' ? setSelect(el, v) : (multi ? quiet(el, v) : setText(el, v));
      if (okSet) { ok++; mark(el, true); }
    };
    const flush = () => { for (const el of pending) { el.dispatchEvent(new Event('change', { bubbles: true })); finishInput(el); } };
    const t = field.type;
    if (t === 'phone') {
      if (els.length >= 3) phoneParts(value).forEach((p, i) => els[i] && put(els[i], p));
      else if (els.length === 2) { const p = phoneParts(value); put(els[0], p[0]); put(els[1], p[1] + p[2]); }
      else { const el = els[0]; const digits = String(value).replace(/\D/g, ''); const dashed = phoneParts(value).join('-'); put(el, (el.maxLength > 0 && el.maxLength <= 11) || !/-/.test(el.placeholder || '-') ? digits : dashed); }
    } else if (t === 'email') {
      const [id, dom] = String(value).split('@');
      // 아이디 칸만 따로 잡힌 경우(도메인 칸을 건너뛰기로 알려 준 경우 등)는 @ 앞부분만
      const idOnly = e => /(^|[^a-z])e?mail_?(id|local)\b/i.test((e.name || '') + ' ' + (e.id || '')) || /이메일아이디|메일id/.test(norm(describe(e)));
      if (els.length === 1 && idOnly(els[0])) put(els[0], id);
      else if (els.length === 1 || els.every(e => e.type === 'email')) els.forEach(e => put(e, value));
      else {
        const sels = els.filter(e => e.tagName === 'SELECT');
        const ins = els.filter(e => e.tagName !== 'SELECT');
        for (const s of sels) { if (setSelect(s, dom)) { ok++; mark(s, true); } else { const direct = [...s.options].find(o => /직접|기타|self/i.test(o.text)); if (direct) { s.value = direct.value; fire(s); ok++; mark(s, true); } } }
        if (ins[0]) put(ins[0], id);
        if (ins[1]) put(ins[1], dom);
      }
    } else if (t === 'period') {
      // 칸 2개: 시작·종료 / 칸 4개 이상(년월 선택 등): 앞 절반 시작, 뒤 절반 종료
      const [from, to] = value;
      if (els.length === 2) { if (from) put(els[0], formatDate(els[0], from)); if (to) put(els[1], formatDate(els[1], to)); }
      else if (els.length >= 4) {
        const half = els.length / 2, a = dateParts(from || ''), b = dateParts(to || '');
        els.forEach((el, i) => { const p = i < half ? a : b, j = i % half; const v = el.tagName === 'SELECT' ? p[j] : (j === 0 ? p[j] : (p[j] || '').padStart(2, '0')); if (v) put(el, v); });
      } else if (els.length === 1 && from) put(els[0], formatDate(els[0], from) + (to ? ' ~ ' + formatDate(els[0], to) : ''));
    } else if (t === 'date' || t === 'month') {
      if (els.length === 1) put(els[0], formatDate(els[0], value));
      else { const p = dateParts(value); els.forEach((el, i) => put(el, el.tagName === 'SELECT' ? p[i] : (i === 0 ? p[i] : (p[i] || '').padStart(2, '0')))); }
    } else if ((list === 'certificates' && field.key === 'name') || (list === 'languages' && field.key === 'test')) {
      for (const el of els.slice(0, 1)) {
        const done = el.tagName === 'SELECT' ? (selectCanon(el, value) || setSelect(el, value)) : setText(el, value);
        if (done) { ok++; mark(el, true); }
      }
    } else if (field.key === 'grade' && (list === 'certificates' || list === 'languages')) {
      if (setGrade(els[0], value)) { ok++; mark(els[0], true); }
    } else if (field.key === 'address1' && els.length > 1) {
      put(els[0], value); // 같은 칸에 상세주소가 붙어 있으면 상세주소 단계에서 따로 처리
    } else {
      put(els[0], value);
    }
    flush();
    return ok;
  }

  function radioLabelEl(r) {
    return (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)) || r.closest('label');
  }
  function radioLabel(r) {
    const lab = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
    const t = lab ? textOf(lab) : (r.closest('label') ? textOf(r.closest('label')) : (r.nextSibling ? (r.nextSibling.textContent || '').trim() : ''));
    return norm(t) || norm(r.value);
  }
  function fillRadios(radios, field, value) {
    const ws = variants(value);
    // 1 = 새로 고름, 2 = 이미 맞게 골라져 있음 (두 번째 채우기에서 다시 세지 않도록)
    // 이름표가 있으면 이름표를 실제 마우스처럼 누름: 꾸민 라디오(CJ 등)는 이름표 클릭으로만 화면 표시가 바뀜
    const choose = r => { const was = r.checked; if (!r.checked) { const l = radioLabelEl(r); if (l) fireAt0(l); else r.click(); if (!r.checked) { r.click(); } if (!r.checked) { r.checked = true; fire(r); } } mark(visible(r) ? r : (radioLabelEl(r) || r), true); return was ? 2 : 1; };
    for (const w of ws) { const r = radios.find(r => radioLabel(r) === w || norm(r.value) === w); if (r) return choose(r); }
    for (const w of ws) {
      if (w.length <= 2) continue;
      const r = radios.find(r => { const t = radioLabel(r); return t && t.includes(w) && (NEG.test(t) === NEG.test(w)); });
      if (r) return choose(r);
    }
    return 0;
  }

  function mark(el, ok) {
    const target = el.type === 'radio' ? (el.closest('td,dd,li,div') || el) : el;
    target.__pubfillTeachEl = el.__pubfillTeachEl || el;
    target.__pubfillFingerprint = el.__pubfillFingerprint || target.__pubfillFingerprint || '';
    if (!target.dataset.pubfillOrig) target.dataset.pubfillOrig = target.style.outline || 'none';
    target.style.outline = ok ? '2px solid #22a35a' : '2px solid #f2b705';
    target.style.outlineOffset = '1px';
    target.dataset.pubfill = ok ? 'ok' : 'check';
  }
  function clearMarks() {
    document.querySelectorAll('[data-pubfill]').forEach(el => { el.style.outline = el.dataset.pubfillOrig === 'none' ? '' : el.dataset.pubfillOrig; delete el.dataset.pubfill; delete el.__pubfillTeachEl; delete el.__pubfillFingerprint; });
  }

  // ---------- 화면 분석 ----------
  function analyze(fieldMappings = {}) {
    const all = [...document.querySelectorAll('input,select,textarea')].filter(el => {
      const ty = (el.type || '').toLowerCase();
      if (['hidden', 'password', 'file', 'submit', 'button', 'image', 'reset', 'checkbox'].includes(ty)) return false;
      if (el.disabled) return false;
      if (ty === 'radio' && !visible(el)) { const l = radioLabelEl(el); return !!(l && visible(l)); } // 모양만 입힌 숨은 라디오
      return visible(el);
    });
    const sec = sectionMap(all);
    const descs = new Map(all.map(el => [el, describe(el)]));
    const fps = fingerprintIndex(all, el => descs.get(el) || '', el => sec.get(el) || '');
    return all.map(el => {
      const desc = descs.get(el);
      const fp = fps.get(el);
      el.__pubfillFingerprint = fp;
      let m = match(el, desc, sec.get(el));
      let skip = !!(m && m.skip);
      if (isUserSkip(fp, fieldMappings)) { m = null; skip = true; }
      // 주민번호·비밀번호 같은 절대 제외 칸은 연결이 있어도 채우지 않음. 그 밖의 제외('검색'·'아이디' 등)는 사용자가 알려 준 연결을 따름
      else { const mp = mappingFor(fp, fieldMappings); if (mp && !isHardSkip(desc)) { m = mp; skip = false; } }
      return { el, desc, section: sec.get(el) || null, m: m && !m.skip ? m : null, skip };
    });
  }

  // <button type="button">비대상</button><button type="button">대상</button> 형태
  const BTN_SEL = 'button[type="button"],[role="radio"],[role="button"],a[href^="#"],a[href^="javascript"]';
  const isOn = b => /\b(on|active|selected|checked|current)\b/i.test(b.className) || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true';
  function buttonGroups() {
    const byParent = new Map();
    document.querySelectorAll(BTN_SEL).forEach(b => {
      const t = norm(textOf(b));
      if (!t || t.length > 8 || !visible(b) || b.closest('label') || b.querySelector('input')) return;
      const p = b.parentElement; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(b);
    });
    // 버튼마다 상자로 한 겹 감싼 경우(트리니티항공 등): 혼자인 버튼은 한 단계 위에서 다시 묶음
    for (const [p, bs] of [...byParent.entries()]) {
      if (bs.length !== 1 || !p.parentElement) continue;
      const gp = p.parentElement; byParent.delete(p);
      if (!byParent.has(gp)) byParent.set(gp, []); byParent.get(gp).push(bs[0]);
    }
    // 화면에 보이지 않는 입력칸(숨은 라디오 등)은 묶음 판단에서 제외
    const hasVisibleInput = p => [...p.querySelectorAll('input:not([type=hidden]),select,textarea')].some(visible);
    return [...byParent.entries()].filter(([p, bs]) => bs.length >= 2 && bs.length <= 6 && !hasVisibleInput(p));
  }
  function fillButtonGroups(profile) {
    let n = 0;
    const choiceFields = SCALAR_FIELDS.filter(f => f.type === 'select');
    for (const [p, bs] of buttonGroups()) {
      const d = norm(groupTitle(p));
      const gfp = fpButtons(p, bs); p.__pubfillFingerprint = gfp;
      if (isUserSkip(gfp, curMappings)) continue;
      const mapped = mappingFor(gfp, curMappings);
      let f = choiceFields.map(f => [f, scoreField(f, d)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
      if (mapped && !mapped.list) f = [mapped.field, 99];
      // 복무 개월 버튼(18 개월 / 21 개월 / 24 개월): 입대일·전역일로 개월 수를 계산해 같은 버튼을 누름 (트리니티항공)
      if (bs.every(b => /^\d+개월$/.test(norm(textOf(b))))) {
        // 내 정보에 '복무 개월 버튼'을 정해 두었으면 그 버튼을 누름 (예: 실제 복무가 며칠 길어도 24 개월)
        if (profile.militaryMonths) continue; // 정해 둔 개월 버튼은 날짜를 달력으로 고른 뒤에 누름
        const a = dateParts(profile.militaryStart || ''), e = dateParts(profile.militaryEnd || '');
        if (/^\d{4}$/.test(a[0]) && /^\d{4}$/.test(e[0]) && a[1] && e[1]) {
          // 사이트는 이 버튼을 누르면 전역일 기준으로 입대일을 다시 계산함 → 정확히 N개월일 때만 누름
          const ds = new Date(+a[0], +a[1] - 1, +(a[2] || 1)), de = new Date(+e[0], +e[1] - 1, +(e[2] || 1));
          const exact = n => { const t = new Date(ds); t.setMonth(t.getMonth() + n); t.setDate(t.getDate() - 1); return t.getTime() === de.getTime(); };
          const b = bs.find(b => exact(parseInt(norm(textOf(b)), 10)));
          if (b) { if (!isOn(b)) b.click(); mark(b, true); n++; }
        }
        continue;
      }
      if (!f || !profile[f[0].key]) continue;
      for (const w of variants(profile[f[0].key])) {
        const b = bs.find(b => norm(textOf(b)) === w); // 정확히 같은 글자만 클릭
        if (b) { if (!isOn(b)) b.click(); mark(b, true); n++; break; }
      }
    }
    return n;
  }

  // 동의 항목 모두 체크 (사용자가 팝업에서 직접 누를 때만 실행)
  window.__pubAgreeAll = function () {
    const lab = el => {
      const l = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      let t = l ? textOf(l) : '';
      if (!t) { let n = el.nextSibling, k = 0; while (n && k < 3 && !t) { t = (n.textContent || '').trim(); n = n.nextSibling; k++; } }
      if (!t) t = (el.parentElement ? cellText(el.parentElement) : '');
      return norm(t);
    };
    const NO = /동의하지않|미동의|비동의|거부|동의안함|아니오/;
    const clickable = el => { const l = radioLabelEl(el); return (!visible(el) && l) ? l : el; };
    let checked = 0, already = 0, disabled = 0;
    const boxes = [...document.querySelectorAll('input[type=checkbox]')];
    // 1) '전체 동의 / 모두 동의' 먼저
    for (const b of boxes) {
      const t = lab(b);
      if (/(전체|모두|전부|일괄)동의/.test(t) && !NO.test(t)) { if (b.disabled) { disabled++; continue; } if (!b.checked) { clickable(b).click(); if (!b.checked) { b.checked = true; fire(b); } checked++; } else already++; mark(visible(b) ? b : (radioLabelEl(b) || b), true); }
    }
    // 2) 나머지 동의 체크박스
    for (const b of boxes) {
      const t = lab(b);
      if (!/동의|확인했|숙지|이해했/.test(t) || NO.test(t)) continue;
      if (b.disabled) { disabled++; continue; }
      if (!b.checked) { clickable(b).click(); if (!b.checked) { b.checked = true; fire(b); } checked++; } else already++;
      mark(visible(b) ? b : (radioLabelEl(b) || b), true);
    }
    // 3) '동의함 / 동의하지 않음' 선택 버튼
    const groups = new Map();
    document.querySelectorAll('input[type=radio]').forEach(r => { const k = r.name || r.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    for (const rs of groups.values()) {
      const yes = rs.find(r => { const t = lab(r); return /^(동의|동의함|동의합니다|예|네)$/.test(t) || (/동의/.test(t) && !NO.test(t)); });
      const hasNo = rs.some(r => NO.test(lab(r)));
      if (!yes || !hasNo) continue;
      if (yes.disabled) { disabled++; continue; }
      if (!yes.checked) { clickable(yes).click(); if (!yes.checked) { yes.checked = true; fire(yes); } checked++; } else already++;
      mark(visible(yes) ? yes : (radioLabelEl(yes) || yes), true);
    }
    return { checked, already, disabled };
  };


  // ---------- 버튼으로 여는 선택 상자·달력 (그리팅 등 Ark UI 화면) ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ARK_SEL = 'button[role="combobox"][data-scope="select"], button[data-scope="date-picker"][data-part="trigger"]';
  function arkLabel(btn) {
    const ids = (btn.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    let t = ids.map(i => textOf(document.getElementById(i))).join(' ');
    // 바깥쪽 묶음으로 올라가며 이름표 찾기 (병역사항처럼 이름표가 한 겹 바깥에 있는 경우)
    for (let root = btn.closest('[data-scope="field"][data-part="root"]'); !t && root; root = root.parentElement && root.parentElement.closest('[data-scope="field"][data-part="root"]')) {
      const l = root.querySelector(':scope > label'); t = textOf(l);
    }
    // 재학기간처럼 이름표 하나에 달력 두 개면 버튼 안 글자(입학일·졸업일)를 덧붙임
    if (btn.hasAttribute('data-placeholder-shown') || btn.dataset.placeholder === 'true') { const ph = textOf(btn); if (ph && !/^(선택|날짜선택)$/.test(norm(ph))) t = (t + ' ' + ph).trim(); }
    return t;
  }
  function arkTargets(fieldMappings = {}) {
    const buttons = [...document.querySelectorAll(ARK_SEL)].filter(b => visible(b) && !b.closest('header,nav,[role=banner]'));
    const labels = new Map(buttons.map(btn => [btn, arkLabel(btn)]));
    const fps = fingerprintIndex(buttons, btn => labels.get(btn) || '', () => '');
    return buttons.map(btn => {
      const isDate = btn.dataset.scope === 'date-picker';
      const label = labels.get(btn) || '', d = norm(label), nm = ((btn.name || '').toLowerCase().split('.').slice(0, 2).pop()) || '';
      const defaultList = /education|school|universit|academic/.test(nm) ? LISTS.find(l => l.key === 'education')
        : /language/.test(nm) ? LISTS.find(l => l.key === 'languages')
        : /certificat|licen[cs]e/.test(nm) ? LISTS.find(l => l.key === 'certificates')
        : /project|extracurricular|activit/.test(nm) ? null
        : /work|career|experience|employment(?!status)/.test(nm) && !/militar|preferential/.test(nm) ? LISTS.find(l => l.key === 'career') : null;
      const fp = fps.get(btn);
      btn.__pubfillFingerprint = fp;
      const mapped = mappingFor(fp, fieldMappings);
      if (mapped) {
        const list = mapped.list ? LISTS.find(l => l.key === mapped.list) : null;
        return { btn, isDate, label, list, field: mapped.field, alts: [mapped.field] };
      }
      const hint = nameHint(btn);
      if (hint) return { btn, isDate, label, list: hint.list ? LISTS.find(l => l.key === hint.list) : null, field: hint.field, alts: [hint.field] };
      if (!defaultList && /project|extracurricular|activit|additionalquestion|customattribute/.test(nm)) return { btn, isDate, label, list: null, field: null };
      const pool = (defaultList ? defaultList.fields : SCALAR_FIELDS).filter(f => isDate ? (f.type === 'date' || f.type === 'month') : (f.type === 'select' || !f.type || f.type === 'text'));
      const ranked = pool.map(f => [f, scoreField(f, d)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      // 점수가 같은 후보는 모두 시도 (예: 병역구분 = 군필/미필인 사이트와 현역병/사회복무요원인 사이트)
      const alts = ranked.filter(x => x[1] === (ranked[0] || [])[1]).map(x => x[0]);
      return { btn, isDate, label, list: defaultList, field: alts[0] || null, alts };
    });
  }
  const arkEmpty = btn => btn.hasAttribute('data-placeholder-shown');
  async function arkSelect(btn, v) {
    btn.click(); await sleep(250);
    const c = document.getElementById(btn.getAttribute('aria-controls'));
    const opts = c ? [...c.querySelectorAll('[role="option"]')] : [];
    const ws = variants(v);
    let o = null;
    for (const w of ws) { o = opts.find(x => norm(textOf(x)) === w); if (o) break; }
    if (!o) for (const w of ws) { o = opts.find(x => { const t = norm(textOf(x)); return t.startsWith(w) && NEG.test(t) === NEG.test(w); }); if (o) break; }
    if (o) { o.click(); await sleep(150); }
    if (btn.getAttribute('aria-expanded') === 'true') { document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100); }
    return !!o && !arkEmpty(btn);
  }
  async function arkDate(btn, v) {
    const [y, m0, d0] = dateParts(v); if (!/^\d{4}$/.test(y) || !m0) return false;
    const m = String(m0).padStart(2, '0'), d = String(d0 || '01').padStart(2, '0');
    btn.click(); await sleep(250);
    const base = btn.id.replace(/:trigger$/, '');
    const inp = [...document.querySelectorAll('input[data-scope="date-picker"]')].find(i => i.id.startsWith(base + ':input'));
    if (!inp) return false;
    const ph = inp.placeholder || '1990.01.01';
    const sep = (ph.match(/\d{4}([.\-/])/) || [, '.'])[1];
    const n = (ph.match(/[.\-/]/g) || []).length + 1;
    inp.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, [y, m, d].slice(0, Math.max(2, n)).join(sep));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    await sleep(200);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    inp.blur(); await sleep(150);
    return !arkEmpty(btn);
  }

  // 검색해서 고르는 칸(그리팅 학교명 등): 글자를 넣고 결과 목록에서 같은 이름을 눌러야 저장됨
  async function arkCombo(inp, v, hint) {
    const want = norm(v); if (!want) return false;
    const setv = x => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, x); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    // 같은 글자를 다시 넣으면 검색이 안 열리므로 한 번 비운 뒤 넣음
    inp.focus(); inp.click(); setv(''); await sleep(150); setv(String(v));
    let o = null, multi = false;
    for (let t = 0; t < 20 && !o; t++) {
      await sleep(150);
      const c = document.getElementById(inp.getAttribute('aria-controls'));
      const opts = c ? [...c.querySelectorAll('[role="option"]')] : [];
      const head = x => norm((x.firstChild && x.firstChild.nodeType === 3 ? x.firstChild.textContent : '') || (x.firstElementChild ? textOf(x.firstElementChild) : textOf(x)));
      const exact = opts.filter(x => head(x) === want || norm(textOf(x)) === want);
      // 같은 이름이 여러 지역에 있으면 학교소재지로 고르고, 못 고르면 사용자에게 맡김
      if (exact.length > 1) { o = hint ? exact.find(x => norm(textOf(x)).includes(norm(hint))) || null : null; if (!o) { multi = true; break; } }
      else o = exact[0] || (opts.length === 1 && norm(textOf(opts[0])).startsWith(want) ? opts[0] : null);
      if (!o && opts.length && t > 6) break;
    }
    if (o) { o.click(); await sleep(200); inp.dataset.pubfillCombo = 'ok'; }
    else inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return !!o;
  }

  // 글자를 넣어 뜨는 목록에서 같은 값('Seoul' → 'Seoul, South Korea')을 고르는 칸 (Ashby Location)
  async function comboPick(el, v) {
    const want = norm(v); if (!want) return false;
    const setv = x => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, x); el.dispatchEvent(new Event('input', { bubbles: true })); };
    el.focus(); el.click(); setv(''); await sleep(150); setv(String(v));
    let o = null;
    for (let t = 0; t < 20 && !o; t++) {
      await sleep(150);
      const c = document.getElementById(el.getAttribute('aria-controls'));
      const opts = c ? [...c.querySelectorAll('[role="option"]')] : [];
      o = opts.find(x => norm(textOf(x)) === want) || opts.find(x => norm(textOf(x)).startsWith(want + ','));
    }
    if (o) { o.click(); await sleep(250); }
    else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return !!o && norm(el.value).startsWith(want);
  }


  // ---------- 입력칸이 아닌 선택 버튼·목록 (구글 설문 등: role=radio / role=listbox) ----------
  const SIDO = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['강원', '강원'], ['충청북', '충북'], ['충북', '충북'], ['충청남', '충남'], ['충남', '충남'], ['전라북', '전북'], ['전북', '전북'], ['전라남', '전남'], ['전남', '전남'], ['경상북', '경북'], ['경북', '경북'], ['경상남', '경남'], ['경남', '경남'], ['제주', '제주']];
  // 우편번호(5자리) 앞 두 자리로 시·도 판단
  const ZIP_SIDO = [[1, 9, '서울'], [10, 20, '경기'], [21, 23, '인천'], [24, 26, '강원'], [27, 29, '충북'], [30, 30, '세종'], [31, 33, '충남'], [34, 35, '대전'], [36, 40, '경북'], [41, 43, '대구'], [44, 45, '울산'], [46, 49, '부산'], [50, 53, '경남'], [54, 56, '전북'], [57, 60, '전남'], [61, 62, '광주'], [63, 63, '제주']];
  function sidoOf(addr, zip) {
    const t = String(addr || '').replace(/[\s()\[\]\d-]/g, '');
    // 주소 맨 앞 → 주소 안 어디든 (예: '(12345) 경기도 …')
    let e = SIDO.find(([k]) => t.startsWith(k)) || SIDO.find(([k]) => k.length >= 3 && t.includes(k)) || SIDO.find(([k]) => t.includes(k + '도') || t.includes(k + '시') || t.includes(k + '특별') || t.includes(k + '광역'));
    if (e) return e[1];
    const z = String(zip || '').replace(/\D/g, '');
    if (z.length === 5) { const n = +z.slice(0, 2); const r = ZIP_SIDO.find(([a, b]) => n >= a && n <= b); if (r) return r[2]; }
    return '';
  }
  const ariaTitle = g => {
    const li = g.closest('[role="listitem"]'); const h = li && li.querySelector('[role="heading"]');
    if (h) return textOf(h);
    const lb = g.getAttribute('aria-labelledby'); return lb ? lb.split(/\s+/).map(id => textOf(document.getElementById(id))).join(' ') : (g.getAttribute('aria-label') || groupTitle(g));
  };
  window.__pubSido = (a, z) => sidoOf(a, z);
  function ariaFieldFor(title) {
    const d = norm(title);
    if (/거주지|거주지역|사는지역|현거주|주거지/.test(d)) return { key: 'address1', label: '주소(지역 변환)' };
    const f = SCALAR_FIELDS.filter(f => f.type === 'select').map(f => [f, scoreField(f, d)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    return f ? f[0] : null;
  }
  const excludedQuestion = title => {
    const d = norm(title);
    return !d || SKIP.some(s => d.includes(norm(s)));
  };
  function ariaValueFor(title, profile) {
    const f = ariaFieldFor(title);
    if (!f) return '';
    if (f.key === 'address1' && f.label === '주소(지역 변환)') return sidoOf(profile.address1, profile.zip);
    return profile[f.key] || '';
  }
  function pickAria(opts, v, label) {
    const ws = variants(v);
    for (const w of ws) { const o = opts.find(x => norm(label(x)) === w); if (o) return o; }
    // 남 → 남자·남성처럼 앞글자가 같은 선택지 (부정어 구분)
    for (const w of ws) { const o = opts.filter(x => { const t = norm(label(x)); return t && t.startsWith(w) && NEG.test(t) === NEG.test(w); }); if (o.length === 1) return o[0]; }
    return null;
  }
  function ariaTargets() {
    const radios = [...document.querySelectorAll('[role="radiogroup"]')].filter(g => g.querySelector('[role="radio"]') && !g.querySelector('input[type="radio"]') && g.dataset.scope !== 'toggle-group' && visible(g));
    const boxes = [...document.querySelectorAll('[role="listbox"]')].filter(g => !g.dataset.scope && g.closest('[role="listitem"]') && visible(g));
    for (const group of [radios, boxes]) {
      const fps = fingerprintIndex(group, ariaTitle, () => '');
      group.forEach(g => { g.__pubfillFingerprint = fps.get(g); });
    }
    return { radios, boxes };
  }
  async function fillAria(profile, opts, t, fieldMappings = {}) {
    let n = 0, check = 0;
    const lab = x => x.getAttribute('data-value') || x.getAttribute('aria-label') || textOf(x);
    const ordinals = new Map();
    const valueFor = g => {
      const mapped = mappingFor(g.__pubfillFingerprint, fieldMappings);
      if (!mapped) return { value: ariaValueFor(ariaTitle(g), profile), mapped: false };
      if (!mapped.list) {
        const value = mapped.field.key === 'address1' && g.getAttribute('role') === 'listbox'
          ? sidoOf(profile.address1, profile.zip)
          : (profile[mapped.field.key] || '');
        return { value, mapped: true };
      }
      const key = mapped.list + '.' + mapped.field.key;
      const idx = ordinals.get(key) || 0;
      ordinals.set(key, idx + 1);
      return { value: listValue(mapped.list, (profile[mapped.list] || [])[idx], mapped.field) || '', mapped: true };
    };
    for (const g of t.radios) {
      const title = ariaTitle(g);
      if (excludedQuestion(title)) continue;
      const resolved = valueFor(g), v = resolved.value; if (!v) { mark(g, false); check++; continue; }
      const rs = [...g.querySelectorAll('[role="radio"]')];
      if (!opts.overwrite && rs.some(r => r.getAttribute('aria-checked') === 'true')) continue;
      const o = pickAria(rs, v, lab);
      if (o) { o.click(); await sleep(80); mark(o, true); n++; } else { mark(g, false); check++; }
    }
    for (const g of t.boxes) {
      const title = ariaTitle(g);
      if (excludedQuestion(title)) continue;
      const resolved = valueFor(g), v = resolved.value;
      if (!v) { mark(g, false); check++; continue; }
      const cur = g.querySelector('[role="option"][aria-selected="true"]');
      if (!opts.overwrite && cur && cur.getAttribute('data-value')) continue;
      const o = pickAria([...g.querySelectorAll('[role="option"]')].filter(x => x.getAttribute('data-value')), v, lab);
      const isSel = () => !!o && !!g.querySelector(`[role="option"][aria-selected="true"][data-value="${CSS.escape(o.getAttribute('data-value'))}"]`);
      // 구글 설문 목록은 클릭으로는 안 바뀜: 목록을 연 뒤 ↓ 키로 원하는 선택지까지 내려가 Enter
      const K = (el, key, kc) => { for (const t of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key, code: key, keyCode: kc, which: kc, bubbles: true })); };
      if (o && !isSel()) {
        const cur0 = () => g.querySelector('[role="option"][tabindex="0"]') || g.querySelector('[role="option"][aria-selected="true"]');
        // 목록 안 현재 선택지에 초점을 두고 Enter로 열기 (마우스 클릭은 다른 칸에 초점이 있으면 안 열림)
        if (cur0()) { cur0().focus(); await sleep(100); }
        if (g.getAttribute('aria-expanded') !== 'true' && g.contains(document.activeElement)) { K(document.activeElement, 'Enter', 13); await sleep(500); }
        const total = g.querySelectorAll('[role="option"]').length;
        // 키는 이 목록 안에 초점이 있을 때만 보냄 (다른 질문의 선택이 바뀌지 않도록)
        // 같은 선택지가 화면용·목록용 두 벌 있어 요소가 아니라 data-value로 비교
        const want = o.getAttribute('data-value'), at = () => document.activeElement && document.activeElement.getAttribute('data-value');
        for (let k = 0; k <= total && at() !== want && g.contains(document.activeElement); k++) { K(document.activeElement, 'ArrowDown', 40); await sleep(60); }
        if (at() === want) { K(document.activeElement, 'Enter', 13); await sleep(500); }
      }
      const ok = isSel();
      if (!ok && g.getAttribute('aria-expanded') === 'true') g.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      mark(g, ok); if (ok) n++; else check++;
    }
    return { n, check };
  }

  async function fillArk(profile, opts, targets) {
    let n = 0, check = 0; const missing = [];
    for (const t of targets) {
      if (!t.field) { if (arkEmpty(t.btn)) { mark(t.btn, false); check++; } continue; }
      if (!arkEmpty(t.btn) && !opts.overwrite) continue;
      let v;
      if (t.list) {
        const arr = profile[t.list.key] || [];
        let item = t.list.key === 'education' ? eduItemByAttr(t.btn, arr) : (t.list.key === 'certificates' || t.list.key === 'languages') ? rowItem(t.btn, t.list.key, arr) : undefined;
        if (item === undefined) item = arr[+(((t.btn.name || '').match(/\.(\d+)\./) || [])[1] || 0)];
        v = listValue(t.list.key, item, t.field);
      } else v = profile[t.field.key];
      let ok = false;
      if (!t.isDate && !t.list) {
        // 같은 이름표에 맞는 항목이 여럿이면 값이 선택지에 있는 것을 고름
        const tried = [];
        for (const f of t.alts) { const fv = profile[f.key]; if (!fv) { tried.push(f.label); continue; } if (await arkSelect(t.btn, fv)) { ok = true; break; } }
        if (!ok && tried.length) missing.push(...tried);
        mark(t.btn, ok); if (ok) n++; else check++;
        continue;
      }
      if (!v) { if (!t.list) missing.push(t.field.label); mark(t.btn, false); check++; continue; }
      ok = t.isDate ? await arkDate(t.btn, v) : await arkSelect(t.btn, v);
      mark(t.btn, ok); if (ok) n++; else check++;
    }
    return { n, check, missing };
  }

  window.__pubScan = function () {
    return analyze().map(x => ({
      칸설명: (x.desc || ((x.el.tagName === 'SELECT' || x.el.type === 'radio') ? '[질문] ' + groupTitle(x.el.closest('label') || x.el, 160) : '')).slice(0, 80), 구역: x.section, 인식: x.m ? (x.m.list ? x.m.list + '.' : '') + x.m.field.key : (x.skip ? '(제외)' : '-'),
      종류: x.el.tagName.toLowerCase() + (x.el.type ? ':' + x.el.type : ''), name: x.el.name || x.el.id || ''
    })).concat(buttonGroups().map(([p, bs]) => ({ 칸설명: groupTitle(p).slice(0, 60), 구역: null, 인식: '버튼묶음', 종류: 'buttons:' + bs.map(b => textOf(b)).join('/'), name: '' })))
      .concat(dropdownTargets().map(t => ({ 칸설명: t.ph.slice(0, 60) + ' | ' + groupTitle(t.btn, 30), 구역: null, 인식: t.field ? t.field.key : '-', 종류: 'dropdown', name: '' })))
      .concat(arkTargets().map(t => ({ 칸설명: t.label.slice(0, 60), 구역: t.list ? t.list.key : null, 인식: t.field ? (t.list ? t.list.key + '.' : '') + t.field.key : '-', 종류: t.isDate ? 'ark:date' : 'ark:select', name: t.btn.name || '' })))
      .concat((() => {
        const a = ariaTargets();
        return [
          ...a.radios.map(g => { const f = ariaFieldFor(ariaTitle(g)); return { 칸설명: ariaTitle(g).slice(0, 80), 구역: null, 인식: excludedQuestion(ariaTitle(g)) ? '(제외)' : (f ? f.key : '-'), 종류: 'aria:radio', name: '' }; }),
          ...a.boxes.map(g => { const f = ariaFieldFor(ariaTitle(g)); return { 칸설명: ariaTitle(g).slice(0, 80), 구역: null, 인식: excludedQuestion(ariaTitle(g)) ? '(제외)' : (f ? f.key : '-'), 종류: 'aria:listbox', name: '' }; })
        ];
      })());
  };

  // 학력 칸이 학교 단계별로 나뉜 사이트(highschool / college[0] / graduateSchool[0])에서 맞는 줄 고르기
  const LEVEL_OF = it => it.level || '';
  function eduItemByAttr(el, arr) {
    const a = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const idx = +((a.match(/\[(\d+)\]|\.(\d+)\./) || []).slice(1).find(x => x != null) || 0);
    let pool = null;
    if (/high/.test(a)) pool = arr.filter(x => /고등/.test(LEVEL_OF(x)));
    else if (/graduate|master|doctor|grad_?school/.test(a)) pool = arr.filter(x => /대학원/.test(LEVEL_OF(x)));
    else if (/college|univ/.test(a)) pool = arr.filter(x => /^(대학교|전문대학)$/.test(LEVEL_OF(x)));
    return pool ? (pool[idx] || null) : undefined; // undefined = 판단 불가(순서대로)
  }
  const DEGREE = { '대학교': '학사', '전문대학': '전문학사', '대학원(석사)': '석사', '대학원(박사)': '박사' };
  function listValue(list, item, field) {
    if (!item) return '';
    if (field.type === 'period') return (item[field.from] || item[field.to]) ? [item[field.from], item[field.to]] : '';
    if (list === 'education' && field.key === 'degree' && !item.degree) return DEGREE[item.level] || '';
    return item[field.key];
  }

  // 읽기 전용 주소칸 옆에 '우편번호 검색/주소 검색' 버튼이 있으면, 사이트가 검색 창 선택만 인정하는 칸
  function needsAddrSearch(el) {
    if (!el.readOnly) return false;
    let box = el.parentElement;
    for (let k = 0; k < 4 && box; k++, box = box.parentElement) {
      const btn = [...box.querySelectorAll('button,a,input[type=button]')].find(b => /우편번호|주소\s*(검색|찾기)|검색|찾기|postcode|zip/i.test((b.innerText || b.value || '') + ' ' + (b.getAttribute('onclick') || '')));
      if (btn) return btn;
    }
    return false;
  }

  const addressNorm = s => (s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const kliControlText = el => norm(el.tagName === 'INPUT' ? el.value : textOf(el));
  const postcodifySelector = 'input[name^="postcodify_"],input[id^="postcodify_"],.postcodify_search_controls input.keyword';
  function postcodifySearchInput() {
    return [...document.querySelectorAll(postcodifySelector)].find(visible);
  }
  const hasPostcodifyWidget = () => !!document.querySelector(postcodifySelector);
  function postcodifyOpenTab() {
    const nodes = [...document.querySelectorAll('button,a,[role="button"],[role="tab"],div,span,li,label')]
      .filter(el => visible(el) && norm(textOf(el)) === '우편번호')
      .filter(el => ![...el.children].some(child => visible(child) && norm(textOf(child)) === '우편번호'));
    return nodes.find(el => el.matches('button,a,[role="button"],[role="tab"]') || getComputedStyle(el).cursor === 'pointer') || nodes[0] || null;
  }
  function kliAddressDialog(search) {
    const controls = 'button,input[type="button"],input[type="submit"],[role="button"],a';
    for (let box = search; box; box = box.parentElement) {
      const labels = [...box.querySelectorAll(controls)].filter(visible).map(kliControlText);
      if (labels.includes('저장') && labels.includes('취소')) return box;
    }
    return null;
  }
  function clickControl(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const Ctor = window.PointerEvent && type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, opts));
    }
    el.click();
  }
  const controlDisabled = el => !!el.disabled || el.getAttribute('aria-disabled') === 'true';
  function kliSaveButtons(search, dialog) {    const find = scope => [...scope.querySelectorAll('button,input[type="button"],input[type="submit"],[role="button"],a')]
      .filter(el => visible(el) && norm(el.tagName === 'INPUT' ? el.value : textOf(el)) === '저장')
      .filter(el => !/제출|지원서|최종/.test(textOf(el)));
    const inDialog = dialog ? find(dialog) : [];
    if (inDialog.length) return inDialog;
    for (let box = search.parentElement; box && box !== document.documentElement; box = box.parentElement) {
      const found = find(box);
      if (found.length) return found;
    }
    return [];
  }
  function kliConfirmButton() {
    const docs = [document];
    try {
      if (window.parent && window.parent !== window) docs.push(window.parent.document);
    } catch { /* 다른 출처 프레임이면 이 문서만 봅니다 */ }
    for (const doc of docs) {
      const buttons = [...doc.querySelectorAll('button,input[type="button"],input[type="submit"],[role="button"],a')]
        .filter(el => visible(el) && norm(el.tagName === 'INPUT' ? el.value : textOf(el)) === '확인');
      const found = buttons.find(el => {
        for (let box = el.parentElement; box && box !== doc.body; box = box.parentElement) {
          const label = textOf(box);
          if (label.length > 300) return false;
          if (/저장하시겠습니까|저장 하시겠습니까/.test(norm(label)) && /취소/.test(norm(label))) return true;
        }
        return false;
      });
      if (found) return found;
    }
    return null;
  }
  function postcodifySearchButton(search, dialog) {
    const controls = 'button.search_button,button,input[type="button"],input[type="submit"],[role="button"],a';
    const widget = search.closest('.postcodify_search_controls');
    const direct = widget && widget.querySelector('button.search_button');
    if (direct && visible(direct)) return direct;
    for (let box = search.parentElement; box; box = box.parentElement) {
      const button = [...box.querySelectorAll(controls)].find(el => visible(el) && (el.matches('.search_button') || kliControlText(el) === '검색'));
      if (button) return button;
      if (box === dialog) break;
    }
    return null;
  }
  async function fillKliPostcodify(profile) {
    const formAddress = document.querySelector('[name="currentAddress.address"]');
    let search = postcodifySearchInput();
    let markTarget = search || formAddress;
    if (!search) {
      const opener = postcodifyOpenTab();
      if (!opener) return formAddress
        ? { handled: true, success: false, reason: '우편번호 탭을 찾지 못했습니다.', markTarget: formAddress }
        : { handled: false };
      const lastOpen = Number(window.__pubKliPostcodeOpenAt || 0);
      if (Date.now() - lastOpen < 7000) return { handled: false, openRequested: true, markTarget: opener };
      window.__pubKliPostcodeOpenAt = Date.now();
      markTarget = opener;
      opener.click();
      for (let i = 0; i < 50 && !search; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        search = postcodifySearchInput();
      }
      if (!search) return { handled: false, openRequested: true, markTarget: opener };
    }
    const dialog = kliAddressDialog(search);
    if (!dialog) return { handled: true, success: false, reason: '주소 창의 저장/취소 버튼을 찾지 못했습니다.', markTarget: search };
    const targetZip = String(profile.zip || '').replace(/\D/g, '');
    if (targetZip.length !== 5) return { handled: true, success: false, reason: '내 정보에 5자리 우편번호가 없어 검색 결과를 확인하지 않았습니다.', markTarget: search };

    setText(search, profile.address1);
    await new Promise(resolve => setTimeout(resolve, 80));
    const searchButton = postcodifySearchButton(search, dialog);
    if (!searchButton) return { handled: true, success: false, reason: '주소 검색 버튼을 찾지 못했습니다.', markTarget: search };
    searchButton.click();

    const readRows = () => [...dialog.querySelectorAll('.postcodify_search_result,.postcode_search_result')].filter(visible);
    let rows = [];
    for (let i = 0; i < 50; i++) {
      rows = readRows();
      if (rows.length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const rowZip = row => {
      const code = row.querySelector('.code5,.postcodify_code5,[data-postcode5]');
      return String(code?.getAttribute('data-postcode5') || textOf(code) || row.getAttribute('data-postcode5') || '').replace(/\D/g, '');
    };
    const matches = rows.filter(row => rowZip(row) === targetZip);
    if (matches.length !== 1) return {
      handled: true,
      success: false,
      reason: matches.length ? '같은 우편번호 결과가 여러 개여서 자동 선택하지 않았습니다.' : '내 우편번호와 일치하는 검색 결과가 없습니다.',
      markTarget: search
    };
    const resultRow = matches[0];
    const selectResult = resultRow.querySelector('a.selector') || resultRow.querySelector('a') || resultRow;
    selectResult.click();

    const getBase = () => {
      const fields = [...dialog.querySelectorAll('input:not([type="hidden"]),textarea')].filter(el => el !== search && visible(el));
      return fields.find(el => el.matches('.postcodify_address') && !isEmpty(el))
        || fields.find(el => /기본주소|도로명주소/.test(norm(describe(el))) && !isEmpty(el))
        || fields.find(el => el.name === 'currentAddress.address' && !isEmpty(el))
        || (formAddress && !isEmpty(formAddress) ? formAddress : null);
    };
    let base = getBase();
    for (let i = 0; i < 20 && !base; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      base = getBase();
    }
    if (!base) return { handled: true, success: false, reason: '우편번호 결과를 선택했지만 주소 칸이 채워지지 않았습니다.', markTarget: search };

    const detailFields = [...dialog.querySelectorAll('input:not([type="hidden"]),textarea')].filter(el =>
      el !== search && el !== base && visible(el));
    const detail = detailFields.find(el => el.matches('.postcodify_details') || /상세주소/.test(el.placeholder || ''))
      || detailFields.find(el => /상세주소/.test(norm(describe(el))));
    const formDetail = document.querySelector('[name="currentAddress.detailAddress"]');
    const detailTarget = detail || (formDetail && visible(formDetail) ? formDetail : null);
    let detailFilled = false;
    if (profile.address2 && detailTarget && isEmpty(detailTarget)) {
      setText(detailTarget, profile.address2);
      detailFilled = detailTarget.value === String(profile.address2);
      if (!detailFilled) return { handled: true, success: false, reason: '상세주소가 입력칸에 반영되지 않았습니다.', markTarget: search };
    }
    const saveButtons = kliSaveButtons(search, dialog);
    if (!saveButtons.length) return { handled: true, success: false, reason: '주소 창의 저장 버튼을 찾지 못했습니다.', markTarget: search };
    let addressSaved = false;
    const parentAddressValue = () => {
      try {
        if (!window.parent || window.parent === window) return '';
        const field = window.parent.document.querySelector('[name="currentAddress.address"]');
        return field ? field.value : '';
      } catch { return ''; }
    };
    const applied = () => {
      if (formAddress) return !!formAddress.value;
      if (parentAddressValue()) return true;
      return !visible(search) && !!(base && base.value);
    };
    for (const button of saveButtons) {
      let ready = !controlDisabled(button);
      for (let i = 0; i < 30 && !ready; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        ready = visible(button) && !controlDisabled(button);
      }
      if (!ready) continue;
      clickControl(button);
      let confirmClicks = 0;
      for (let i = 0; i < 25; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const confirm = confirmClicks < 2 ? kliConfirmButton() : null;
        if (confirm) {
          clickControl(confirm);
          confirmClicks++;
          await new Promise(resolve => setTimeout(resolve, 150));
          continue;
        }
        if (applied() || !visible(button) || !visible(search)) break;
      }
      addressSaved = applied() || !visible(button) || !visible(search);
      if (addressSaved) break;
    }
    if (!addressSaved) return { handled: true, success: false, reason: '주소 창의 저장 버튼을 눌렀지만 지원서에 반영되지 않았습니다.', markTarget: search };

    if (profile.address2 && formDetail && visible(formDetail) && isEmpty(formDetail)) {
      setText(formDetail, profile.address2);
      detailFilled = detailFilled || formDetail.value === String(profile.address2);
    }
    for (let i = 0; i < 20; i++) {
      if (!formAddress || formAddress.value) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return {
      handled: true,
      success: true,
      reason: '',
      filled: 1 + (detailFilled ? 1 : 0),
      formAddress, formDetail, markTarget
    };
  }


  // 자격증·어학 줄: 사용자가 그 줄의 이름 칸(검색형)에서 고른 자격증을 내 정보에서 찾아 그 값으로 채움
  const NAME_KW = { certificates: /자격증명|자격명|자격종류|면허명|자격증검색|credential|cert\w*name|licen\w*name/i, languages: /시험명|시험종류|어학시험|시험검색|testname|test_?nm/i };
  let rowNameEls = null;
  function rowNameInputs(list) {
    rowNameEls = rowNameEls || {};
    if (!rowNameEls[list]) rowNameEls[list] = [...document.querySelectorAll('input[type="text"],input[type="search"],input:not([type])')].filter(i => visible(i) && (NAME_KW[list].test(i.name || '') || NAME_KW[list].test(norm(describe(i)))));
    return rowNameEls[list];
  }
  function rowItem(el, list, arr) {
    const names = rowNameInputs(list); if (!names.length) return undefined;
    const nm = el.name || '';
    let ne = nm.includes('.') ? names.find(i => (i.name || '').includes('.') && i.name.slice(0, i.name.lastIndexOf('.')) === nm.slice(0, nm.lastIndexOf('.'))) : null;
    let rowBox = null;
    if (!ne) for (let a = el.parentElement, k = 0; a && k < 8; a = a.parentElement, k++) {
      const c = names.filter(i => a.contains(i));
      if (a.contains(el) && c.length === 1) { ne = c[0]; rowBox = a; break; }
      if (c.length > 1) break;
    }
    if (!ne || ne === el) {
      const hasSearchName = names.some(i => i.type === 'search' || /검색|search/i.test(describe(i) + i.placeholder));
      return hasSearchName ? null : undefined; // 검색형 이름칸을 찾지 못한 경우만 첫 항목 대체를 막음
    }
    if (!rowBox) for (let a = el.parentElement, k = 0; a && k < 8; a = a.parentElement, k++) {
      if (a.contains(ne)) { rowBox = a; break; }
    }
    const key = list === 'certificates' ? 'name' : 'test';
    const itemFor = v => {
      const want = canonOf(v) || n2(v), wg = splitGrade(v).grade;
      const same = arr.filter(it => (canonOf(it[key]) || n2(it[key])) === want);
      return same.find(it => wg && (it.grade || splitGrade(it[key]).grade) === wg) || same[0] || null;
    };
    const v = (ne.value || '').trim();
    if (v) return itemFor(v);
    // 검색 선택형 UI는 선택 뒤 검색 input이 비워지고, 선택된 자격명은 chip/버튼 텍스트로만 남을 수 있습니다.
    if (rowBox) {
      const rowText = n2(textOf(rowBox));
      const selected = arr.find(it => {
        const raw = it[key] || '', base = splitGrade(raw).base;
        return [raw, base, canonOf(raw)].some(s => { const q = n2(s); return q && rowText.includes(q); });
      });
      if (selected) return selected;
    }
    return /검색|search/i.test(describe(ne) + ne.placeholder) ? null : undefined;
  }

  function blockName(el) {
    let box = el.parentElement;
    for (let k = 0; k < 8 && box; k++, box = box.parentElement) {
      const o = [...box.querySelectorAll('input[name],select[name]')].find(x => /highschool|college|graduate|univ/i.test(x.name));
      if (o) return o;
    }
    return el;
  }
  function pressEnter(el) {
    for (const t of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }

  window.__pubFill = function (profile, opts = {}) {
    if (opts.addressOnly) {
      if (!profile.address1) return { filled: 0, check: 0 };
      return fillKliPostcodify(profile).then(state => {
        if (!state.handled) return { filled: 0, check: 0, addressSearchOpenRequested: !!state.openRequested };
        if (state.success) {
          if (state.formAddress) mark(state.formAddress, true);
          if (state.formDetail && profile.address2) mark(state.formDetail, true);
        }
        return {
          filled: state.success ? state.filled : 0,
          check: state.success ? 0 : 1,
          addrSearch: !state.success,
          addressSearchDone: !!state.success,
          addressSearchReason: state.success ? '' : (state.reason || ''),
          addressSearchOpenRequested: !!state.openRequested
        };
      });
    }
    if ((location.host === 'kli.recruiter.co.kr' || hasPostcodifyWidget()) && !opts.skipKliAddress && profile.address1) {
      const address = document.querySelector('[name="currentAddress.address"]');
      const searchVisible = !!postcodifySearchInput();
      if (searchVisible || (address && (opts.overwrite || isEmpty(address) || addressNorm(address.value) === addressNorm(profile.address1)))) {
        return fillKliPostcodify(profile).then(state => {
          if (!state.handled) {
            return Promise.resolve(window.__pubFill(profile, { ...opts, skipKliAddress: true, kliAddressHandled: !!state.openRequested })).then(result => {
              if (state.openRequested) result.addressSearchOpenRequested = true;
              return result;
            });
          }
          return Promise.resolve(window.__pubFill(profile, { ...opts, skipKliAddress: true, kliAddressHandled: true })).then(result => {
            if (state.success) {
              result.filled += state.filled;
              result.addrSearch = false;
              result.addressSearchDone = true;
              if (state.formAddress) mark(state.formAddress, true);
              if (state.formDetail && profile.address2) mark(state.formDetail, true);
            } else {
              result.addrSearch = true;
              result.addressSearchReason = state.reason || '';
              result.check++;
              mark(state.markTarget || address, false);
            }
            return result;
          });
        });
      }
    }
    // 2차 채우기(keepMarks)는 1차에서 칠한 초록·노랑 표시를 지우지 않음
    if (!opts.keepMarks) clearMarks(); rowNameEls = null;
    const allMappings = opts.fieldMappings || {};
    const fieldMappings = allMappings[location.host] || allMappings;
    curMappings = fieldMappings;
    const items = analyze(fieldMappings);
    let filled = 0, check = 0;
    const rsTargets = [];
    const comboAsync = [];
    const done = new Set();
    const missing = new Set(), nochoice = new Set();
    let addrSearch = false;

    // 라디오는 name 묶음 단위로
    const radioGroups = new Map();
    for (const x of items) if (x.el.type === 'radio') {
      const k = x.el.name || x.desc; if (!radioGroups.has(k)) radioGroups.set(k, { x, els: [] }); radioGroups.get(k).els.push(x.el);
    }

    // 학교 검색 칸
    let schoolSearch = false;
    for (const x of items) {
      if (!x.m || x.m.field.key !== 'schoolSearch') continue;
      const arr = profile.education || [];
      const byAttr = eduItemByAttr(blockName(x.el), arr);
      const item = byAttr !== undefined ? byAttr : arr[0];
      done.add(x.el);
      if (!item || !item.school || (!opts.overwrite && !isEmpty(x.el))) continue;
      x.el.focus(); setText(x.el, item.school); pressEnter(x.el); mark(x.el, true); filled++; schoolSearch = true;
    }

    // 같은 항목 + 같은 칸 묶음(td/dd/li)끼리 그룹
    const groups = [];
    const gIndex = new Map();
    for (const x of items) {
      if (x.m && x.m.field.key === 'postcodifySearch') {
        done.add(x.el);
        continue;
      }
      if (!x.m || x.el.type === 'radio' || x.m.field.key === 'schoolSearch') continue;
      if (x.el.tagName === 'TEXTAREA' && !(x.m.field.key === 'duty')) continue;
      // 달력으로만 고르게 막아 둔(읽기 전용) 날짜 칸은 값 넣기 허용
      if (x.el.readOnly && !READONLY_OK.has(x.m.field.key) && !['date', 'month', 'period'].includes(x.m.field.type)) continue;
      let box = x.el.closest('td,dd,li') || x.el.parentElement;
      // 전화 3칸·년월일·기간처럼 칸마다 따로 감싼 경우 위로 올라가며 함께 묶음
      if (['phone', 'date', 'month', 'period'].includes(x.m.field.type)) {
        for (let k = 0; k < 3 && box.querySelectorAll('input,select').length === 1 && box.parentElement; k++) box = box.parentElement;
      }
      const id = (x.m.list || '') + '.' + x.m.field.key;
      const k = id + '|' + (gIndex.has(box) ? gIndex.get(box) : gIndex.set(box, gIndex.size).get(box));
      let g = groups.find(g => g.k === k);
      if (!g) { g = { k, id, m: x.m, els: [] }; groups.push(g); }
      g.els.push(x.el);
    }

    // 여러 줄 항목은 화면 순서대로 n번째 묶음에 n번째 값.
    // 글자·목록 칸 묶음과 버튼(라디오) 묶음을 화면 순서대로 함께 셈(학교마다 칸 모양이 섞여도 순서 유지)
    const unitOrd = new Map();
    {
      const units = groups.filter(g => g.m.list).map(g => ({ key: g, el: g.els[0], id: g.id }))
        .concat([...radioGroups.values()].filter(r => r.x.m && r.x.m.list).map(r => ({ key: r, el: r.els[0], id: r.x.m.list + '.' + r.x.m.field.key })));
      units.sort((a, b) => a.el === b.el ? 0 : (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const c = {}; for (const u of units) unitOrd.set(u.key, c[u.id] = (c[u.id] ?? -1) + 1);
    }
    for (const g of groups) {
      if (opts.kliAddressHandled && (location.host === 'kli.recruiter.co.kr' || hasPostcodifyWidget())
        && (['zip', 'address1'].includes(g.m.field.key) || (g.m.field.key === 'address2' && !opts.fillKliAddressDetail))) {
        g.els.forEach(e => done.add(e));
        continue;
      }
      let value;
      if (g.m.list) {
        const n = unitOrd.get(g) ?? 0;
        const arr = profile[g.m.list] || [];
        let item = arr[n];
        if (g.m.list === 'education') { const byAttr = eduItemByAttr(g.els[0], arr); if (byAttr !== undefined) item = byAttr; }
        if (g.m.list === 'certificates' || g.m.list === 'languages') { const r = rowItem(g.els[0], g.m.list, arr); if (r !== undefined) item = r; }
        value = listValue(g.m.list, item, g.m.field);
        if (g.m.list === 'certificates' || g.m.list === 'languages') {
          const it = item || {}, nameKey = g.m.list === 'certificates' ? 'name' : 'test';
          const sg = splitGrade(it[nameKey] || '');
          const hasGradeCol = groups.some(x => x.id === g.m.list + '.grade');
          if (g.m.field.key === 'grade' && !it.grade) value = sg.grade;
          if (g.m.field.key === nameKey && hasGradeCol && !it.grade && sg.grade) value = sg.base;
          // 등급을 따로 저장했는데 사이트에 등급 칸이 없으면 이름 뒤에 붙여 넣음 (사회조사분석사 2급)
          if (g.m.field.key === nameKey && !hasGradeCol && it.grade && !splitGrade(it[nameKey] || '').grade && !/심화|기본/.test(it[nameKey] || '')) value = (it[nameKey] + ' ' + it.grade).trim();
        }
        if (!value) { g.els.forEach(e => done.add(e)); continue; } // 내 정보에 없는 줄·칸은 일부러 비워 둠
      } else value = g.m.field.type === 'period' ? ((profile[g.m.field.from] || profile[g.m.field.to]) ? [profile[g.m.field.from], profile[g.m.field.to]] : '') : profile[g.m.field.key];
      if (!g.m.list && (g.m.field.key === 'name' || g.m.field.key === 'nameEn') && value) value = namePart(g.els[0], g.m.field.key, value, profile);
      if (!value) { missing.add(g.m.field.label); continue; }
      const targets = opts.overwrite ? g.els : g.els.filter(isEmpty);
      if (!targets.length) { g.els.forEach(e => done.add(e)); continue; }
      // 주소가 한 칸 묶음에 (우편번호, 주소, 상세주소) 함께 있는 경우
      // 검색 버튼으로 넣는 주소칸: 값은 넣되(받아 주는 사이트도 있음), 검색 창 선택을 요구하는 사이트를 위해 알림
      // 화면 안 주소 검색 창으로 넣을 수 있는 사이트(코스트코 '우편번호'): 읽기 전용 주소칸에 값만 넣지 않고 뒤의 fillModalAddress에 맡김
      if (['zip', 'address1', 'address2'].includes(g.m.field.key) && g.els.every(e => e.readOnly) && !hasPostcodifyWidget() && inPageAddrSearch() && modalAddrOpener()) {
        g.els.forEach(e => done.add(e)); continue;
      }
      if (['zip', 'address1'].includes(g.m.field.key) && g.els.some(needsAddrSearch)) {
        addrSearch = true;
        g.els.map(needsAddrSearch).filter(Boolean).forEach(b => mark(b, false));
      }
      if (g.m.field.key === 'address1' && g.els.length >= 2) {
        const looksZip = el => /zip|post|우편/i.test((el.name || '') + (el.id || '') + (el.placeholder || '')) || (el.maxLength > 0 && el.maxLength <= 7) || (el.size > 0 && el.size <= 7);
        const rest = [profile.address1, profile.address2];
        g.els.forEach(el => {
          const v = looksZip(el) ? profile.zip : rest.shift();
          if (v && (opts.overwrite || isEmpty(el)) && setText(el, v)) { filled++; mark(el, true); }
          done.add(el);
        });
        continue;
      }
      // 성·이름 칸이 한 묶음으로 잡히면 칸마다 따로 나눠 넣음
      if (!g.m.list && (g.m.field.key === 'name' || g.m.field.key === 'nameEn') && targets.length > 1) {
        const full = profile[g.m.field.key];
        let k = 0; for (const el of targets) { const v = namePart(el, g.m.field.key, full, profile); if (v) k += fillGroup([el], g.m.field, v, null) ? 1 : 0; else mark(el, false); }
        g.els.forEach(e => done.add(e)); if (k) filled++; continue;
      }
      // 검색형 목록(Ashby Location): 글자를 넣고 목록에서 골라야 저장됨 → 모아서 뒤에 처리
      const sc = targets.filter(isSearchCombo);
      if (sc.length && typeof value === 'string') {
        sc.forEach(el => { comboAsync.push({ el, value }); done.add(el); });
        if (sc.length === targets.length) { g.els.forEach(e => done.add(e)); continue; }
      }
      // React 선택 목록(Greenhouse 등): 글자만 넣으면 선택되지 않아, 팝업이 크롬 디버거로 실제 키 입력해 고르도록 표시만 함
      const rs = targets.filter(isReactSelect);
      if (rs.length && typeof value === 'string') {
        rs.forEach(el => { const k = 'rs' + (rsTargets.length + 1); el.setAttribute('data-pubfill-rs', k); rsTargets.push({ key: k, value, alts: variants(value), field: (g.m.list ? g.m.list.key + '.' : '') + g.m.field.key }); done.add(el); });
        if (rs.length === targets.length) { g.els.forEach(e => done.add(e)); continue; }
      }
      const n = fillGroup(targets, g.m.field, value, g.m.list);
      filled += n;
      g.els.forEach(e => done.add(e));
    }
    for (const rg of radioGroups.values()) {
      const { x, els } = rg;
      if (!x.m) { mark(els[0], false); continue; }
      let v;
      if (x.m.list) {
        const arr = profile[x.m.list] || [], id = x.m.list + '.' + x.m.field.key;
        const n = unitOrd.get(rg) ?? 0;
        let item = arr[n];
        if (x.m.list === 'education') { const byAttr = eduItemByAttr(els[0], arr); if (byAttr !== undefined) item = byAttr; }
        v = listValue(x.m.list, item, x.m.field);
        if (!v) { els.forEach(e => done.add(e)); mark(els[0], false); continue; }
        const rr = fillRadios(els, x.m.field, v);
        if (rr) { if (rr === 1) filled++; els.forEach(e => done.add(e)); } else { nochoice.add(x.m.field.label); mark(els[0], false); }
        continue;
      }
      v = profile[x.m.field.key];
      if (!v) { missing.add(x.m.field.label); mark(els[0], false); continue; }
      const rr = fillRadios(els, x.m.field, v);
      if (rr) { if (rr === 1) filled++; els.forEach(e => done.add(e)); }
      else { nochoice.add(x.m.field.label); mark(els[0], false); }
    }
    filled += fillButtonGroups(profile);
    // 못 채운 빈 칸은 노란 표시
    for (const x of items) {
      if (done.has(x.el) || x.skip || x.el.type === 'radio') continue;
      if (x.el.tagName === 'TEXTAREA' && !(x.m && x.m.field.key === 'duty')) continue;
      if (isEmpty(x.el)) { mark(x.el, false); check++; }
    }
    // 증명사진 첨부: 칸 설명에 사진·photo가 있는 빈 파일 칸에만(자격증 사본·증명서·포트폴리오·이력서 같은 서류 칸 제외)
    let photo = 0;
    if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(profile.photo || '')) {
      for (const el of document.querySelectorAll('input[type=file]')) {
        if ((el.files && el.files.length) || el.disabled) continue;
        const acc = (el.accept || '').toLowerCase();
        if (acc && !/image|jpe?g|png|\*/.test(acc)) continue;
        let near = ''; let n = el.parentElement;
        // 주변 글자: 다른 입력 칸을 품지 않는 바깥까지만(옆 칸의 '자격증 사본' 같은 글이 섞이지 않게)
        for (let k = 0; n && k < 3; k++, n = n.parentElement) { if (n.querySelectorAll('input,select,textarea').length > 1) break; const t = textOf(n); if (t.length < 120) near = t; }
        const d = norm([describe(el), el.name, el.id, near].join(' '));
        if (!/사진|photo|picture|프로필이미지|profileimage/.test(d)) continue;
        if (/자격|증빙|증명서|포트폴리오|portfolio|이력서|resume|\bcv\b|자기소개|coverletter|성적|transcript|졸업|재학|경력|어학|서류|document/.test(d)) continue;
        try {
          const b = atob(profile.photo.split(',')[1]); const u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
          const dt = new DataTransfer(); dt.items.add(new File([u8], 'photo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
          el.files = dt.files;
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          photo++; filled++;
        } catch (e) { /* 파일 칸을 바꿀 수 없는 사이트는 건너뜀 */ }
      }
    }
    const result = { filled, check, url: location.host, missing: [...missing], nochoice: [...nochoice], addrSearch, schoolSearch, rsTargets, photo };
    const base = (() => {
      const ark = arkTargets(fieldMappings);
      const combos = items.filter(x => x.m && x.el.matches('input[data-scope="combobox"]') && x.el.value && done.has(x.el));
      const aria = ariaTargets();
      if (aria.radios.length || aria.boxes.length) {
        const before = (ark.length || combos.length) ? null : result;
        if (before) return fillAria(profile, opts, aria, fieldMappings).then(r => ({ ...result, filled: result.filled + r.n, check: result.check + r.check }));
      }
      if (!ark.length && !combos.length) return result;
      if (combos.length) return (async () => {
        for (const x of combos) { const it = x.m.list === 'education' ? eduItemByAttr(x.el, profile.education || []) : null; const ok = await arkCombo(x.el, x.el.value, it && it.region); mark(x.el, ok); if (!ok) { result.check++; result.schoolSearch = result.schoolSearch || x.m.list === 'education'; } }
        if (!ark.length) return result;
         const r = await fillArk(profile, opts, ark);
        return { ...result, filled: result.filled + r.n, check: result.check + r.check, missing: [...new Set([...result.missing, ...r.missing])] };
      })();
      // 선택 상자·달력은 열고 닫는 시간이 필요해 차례로 처리한 뒤 결과를 돌려줌
      return fillArk(profile, opts, ark).then(r => ({ ...result, filled: result.filled + r.n, check: result.check + r.check, missing: [...new Set([...result.missing, ...r.missing])] }));
    })();
    // 버튼을 눌러 여는 목록(트리니티항공 등 recruiter 새 화면): 앞 단계가 끝난 뒤 나타난 칸까지 처리
    return Promise.resolve(base).then(async res => {
      for (const c of comboAsync) {
        const ok = await comboPick(c.el, c.value);
        mark(c.el, ok);
        res = ok ? { ...res, filled: res.filled + 1 } : { ...res, check: res.check + 1 };
      }
      await sleep(400); // 군필 등을 누른 뒤 잠겨 있던 목록이 풀릴 시간
      // 연도·월·일을 눌러 고르는 달력: 글자로 넣은 값은 사이트가 인정하지 않아 달력으로 다시 고름
      for (const { inp, key } of calendarInputs()) {
        const v = profile[key]; if (!v || (profile.militaryMonths && inp.dataset.pubfillMonths === '1')) continue;
        // 앞 단계에서 '시작 ~ 끝'처럼 잘못 들어간 글자는 지우고 달력으로 다시 고름
        if (/~/.test(inp.value)) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); }
        const ok = await pickCalendar(inp, v); mark(inp, ok);
      }
      if (profile.militaryMonths) {
        // 사용자 결정(2026-11-20): 개월 버튼을 정해 두었으면 버튼을 누르고, 사이트가 그 개월 수에 맞춰 바꾼 날짜(예: 제대일 2014.03.25)를 그대로 둠
        const mb = [...document.querySelectorAll('button')].find(b => visible(b) && parseInt(norm(textOf(b)), 10) === +profile.militaryMonths && /개월$/.test(norm(textOf(b))));
        if (mb) {
          fireAt0(mb); await sleep(400);
          for (const { inp } of calendarInputs()) if (inp.value) { mark(inp, true); inp.dataset.pubfillMonths = '1'; } // 두 번째 채우기 때 다시 고르지 않도록
          mark(mb, true);
        }
      }
      // 읽기 전용 달력칸: 아직 비어 있으면 달력에서 고름
      { const ord = {};
        for (const x of analyze(curMappings)) {
          if (!x.m || !['date', 'month'].includes(x.m.field.type) || !x.el.readOnly || x.el.value || !visible(x.el)) continue;
          let v;
          if (x.m.list) { const k = x.m.list + '.' + x.m.field.key; const n = ord[k] = (ord[k] ?? -1) + 1; const it = (profile[x.m.list] || [])[n]; v = it && it[x.m.field.key]; }
          else v = profile[x.m.field.key];
          if (!v) continue;
          const ok = await pickTitleCalendar(x.el, v); mark(x.el, ok);
          if (ok) res = { ...res, filled: res.filled + 1 };
        } }
      const ma = await fillModalAddress(profile);
      if (ma) { res = { ...res, filled: res.filled + (ma.ok ? 1 : 0), check: res.check + (ma.ok ? 0 : 1), addressSearchDone: ma.ok || res.addressSearchDone, addrSearch: ma.ok ? res.addrSearch : true, addressSearchReason: ma.reason || res.addressSearchReason }; }
      const dd = dropdownTargets();
      if (!dd.length) return res;
      const r = await fillDropdowns(profile, opts, dd);
      return { ...res, filled: res.filled + r.n, check: res.check + r.check, missing: [...new Set([...(res.missing || []), ...r.missing])] };
    });
  };




  // ---------- 연도 → 월 → 일을 차례로 누르는 달력 (트리니티항공 입대일·제대일 등) ----------
  const CAL_FIELDS = { '입대일': 'militaryStart', '제대일': 'militaryEnd', '전역일': 'militaryEnd' };
  // 병역 기간 칸: 안내글이 '입대일/제대일'이거나, 이름표에 입대·제대·전역·복무기간이 있는 달력 칸.
  // 한 줄에 두 칸이면 앞 = 입대일, 뒤 = 제대일 (안내글이 비어 있거나 '시작 ~ 끝'이 잘못 들어간 경우 대비)
  function calendarInputs() {
    const all = [...document.querySelectorAll('input')].filter(i => visible(i) && !i.disabled && i.type !== 'hidden' && i.parentElement && i.parentElement.querySelector('svg')
      && (CAL_FIELDS[norm(i.placeholder || '')] || /입대|제대|전역|복무기간/.test(norm(describe(i)))));
    const out = [];
    for (const i of all) {
      let key = CAL_FIELDS[norm(i.placeholder || '')];
      if (!key) {
        let row = i.parentElement; for (let k = 0; k < 4 && row && [...row.querySelectorAll('input')].filter(x => all.includes(x)).length < 2; k++) row = row.parentElement;
        const pair = row ? [...row.querySelectorAll('input')].filter(x => all.includes(x)) : [i];
        key = pair.length >= 2 ? (pair.indexOf(i) === 0 ? 'militaryStart' : 'militaryEnd') : (/제대|전역/.test(norm(describe(i))) ? 'militaryEnd' : 'militaryStart');
      }
      out.push({ inp: i, key });
    }
    return out;
  }
  const fireAt0 = el => { const r = el.getBoundingClientRect(); for (const tp of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new (tp.startsWith('pointer') ? PointerEvent : MouseEvent)(tp, { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse', isPrimary: true })); };
  async function pickCalendar(inp, v) {
    const [y, m0, d0] = dateParts(v); if (!/^\d{4}$/.test(y) || !m0) return false;
    const m = +m0, d = +(d0 || 1);
    const cells = () => [...document.querySelectorAll('button,td,li,div,span,p')].filter(e => visible(e) && e.children.length <= 1 && !inp.parentElement.contains(e));
    // 이전 단계에서 열린 채 남은 달력이 있으면 먼저 닫음 (남아 있으면 '새로 뜬 칸' 비교가 틀어짐)
    const openPicker = () => [...document.querySelectorAll('[class*="picker"],[class*="calendar"]')].filter(e => visible(e) && /\d{4}/.test(textOf(e)) && !e.contains(inp)).pop();
    if (openPicker()) {
      for (const t of [document.activeElement, document]) t && t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(200);
      if (openPicker()) { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(250); }
    }
    const before = new Set(cells());
    // 달력 상자를 찾으면 그 안의 칸만, 못 찾으면 '새로 뜬 칸'으로
    const fresh = () => { const pk = openPicker(); return pk ? cells().filter(e => pk.contains(e)) : cells().filter(e => !before.has(e)); };
    const findText = (re) => fresh().filter(e => re.test(textOf(e)));
    const fireAt = el => { const r = el.getBoundingClientRect(); for (const tp of ['pointerdown', 'mousedown', 'focus', 'pointerup', 'mouseup', 'click']) { if (tp === 'focus') { el.focus && el.focus(); continue; } el.dispatchEvent(new (tp.startsWith('pointer') ? PointerEvent : MouseEvent)(tp, { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse', isPrimary: true })); } };
    const step = t => { inp.dataset.pubfillCal = t; }; // 어디까지 했는지 칸에 기록 (문제 제보용, 값 아님)
    // 달력 열기: 칸 클릭 → 안 열리면 달력 아이콘 클릭
    fireAt(inp); await sleep(450);
    if (!fresh().length) { const icon = inp.parentElement.querySelector('svg'); if (icon) { fireAt(icon); await sleep(450); } }
    if (!fresh().length) { step('달력안열림'); return false; }
    // 연도·월·일 칸은 click()만으로 반응하지 않는 경우가 있어(트리니티항공 월 화면) 마우스 누름·뗌까지 보냄
    const clickEl = e => fireAt(e.closest('button,td,li') || e);
    // 머리글(2026.11)의 '2026' 글자도 4자리 숫자라 연도 칸으로 오인하지 않도록 머리글 안은 제외
    const inHead = e => !!e.closest('[class*="header"],[class*="head"]');
    const yearCell = () => findText(new RegExp('^' + y + '(년)?$')).filter(e => !inHead(e))[0];
    const headYear = () => { const h = fresh().find(e => inHead(e) && /^\d{4}$/.test(textOf(e))) || findText(/^\d{4}\s*[.년]\s*\d{1,2}(월)?$/)[0]; return h; };
    const monthCells = () => findText(/^\d{1,2}월$/).filter(e => !inHead(e));
    // 1) 이미 월 화면이고 머리글 연도가 내 연도면 바로 월로. 아니면 머리글을 눌러 연도 화면으로
    let atMonth = false, atDay = false;
    const headText = () => { const h = fresh().find(e => inHead(e) && /\d{4}/.test(textOf(e))); const box = h && (h.closest('[class*="header"],[class*="head"]') || h.parentElement); return box ? textOf(box).replace(/\s/g, '') : ''; };
    const dayCells = () => fresh().filter(e => !inHead(e) && /^\d{1,2}$/.test(textOf(e)));
    if (!yearCell() && !monthCells().length && dayCells().length >= 28) {
      const ht = headText(); // 예: 2014.04
      if (ht.includes(y + '.' + String(m).padStart(2, '0')) || ht.includes(y + '.' + m)) atDay = true;
    }
    if (!atDay && !yearCell()) {
      const h = headYear();
      if (monthCells().length && h && textOf(h).startsWith(y)) atMonth = true;
      else if (h) { clickEl(h); await sleep(350); }
    }
    // 2) 연도가 보일 때까지 이전/다음 페이지. 화살표는 버튼이 아니라 머리글 안 svg 아이콘일 수 있음
    //    (트리니티항공: div._picker-wrap > div._header [‹ svg] 2026.11 [› svg] / div._body > div._year-wrap > button._year)
    const picker = () => { const yb = fresh().find(e => /^\d{4}$/.test(textOf(e))); return yb && (yb.closest('[class*="picker"],[class*="calendar"],[role="dialog"]') || yb.parentElement.parentElement.parentElement); };
    const arrowsOf = pk => {
      if (!pk) return [];
      const head = pk.querySelector('[class*="header"],[class*="head"]') || pk;
      return [...head.querySelectorAll('svg')].filter(visible).map(v => v.closest('button,a,[role="button"]') || v);
    };
    const fire = el => { const r = el.getBoundingClientRect(); for (const tp of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new (tp.startsWith('pointer') ? PointerEvent : MouseEvent)(tp, { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse', isPrimary: true })); };
    for (let k = 0; k < 10 && !atMonth && !atDay && !yearCell(); k++) {
      const years = fresh().filter(e => !inHead(e)).map(e => textOf(e)).filter(t => /^\d{4}$/.test(t)).map(Number);
      if (!years.length) break;
      const goPrev = +y < Math.min(...years);
      let arrows = arrowsOf(picker());
      if (!arrows.length) arrows = fresh().filter(e => e.tagName === 'BUTTON' && !/\d/.test(textOf(e)));
      const arrow = goPrev ? arrows[0] : arrows[arrows.length - 1];
      if (!arrow) { step('화살표없음'); break; } fire(arrow); await sleep(350);
    }
    const yc = (atMonth || atDay) ? null : yearCell(); if (!atMonth && !atDay && !yc) { step('연도못찾음'); document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return false; }
    if (yc) { clickEl(yc); await sleep(350); }
    // 3) 월 (1월 / 1 / 01)
    const mc = atDay ? true : findText(new RegExp('^0?' + m + '(월)?$')).filter(e => !inHead(e))[0];
    if (mc && mc !== true) { clickEl(mc); await sleep(450); }
    // 4) 일: 같은 숫자가 앞뒤 달에도 있으므로 '1'일 다음에 나오는 첫 칸
    const days = fresh().filter(e => !inHead(e) && /^\d{1,2}$/.test(textOf(e)));
    const first = days.findIndex(e => textOf(e) === '1');
    const dc = days.slice(Math.max(0, first)).find(e => +textOf(e) === d);
    if (dc) { clickEl(dc); await sleep(300); }
    step(mc ? (dc ? '날짜클릭' : '일못찾음') : '월못찾음');
    const got = (inp.value || '').replace(/\D/g, '');
    return got.startsWith(y + String(m).padStart(2, '0')) || got.startsWith(y + m);
  }


  // 성·이름이 나뉜 칸: 한글은 성 1글자(복성 2글자), 영문은 첫 단어 = 성. 띄어쓰기 없는 영문은 한글 성의 로마자로 앞부분을 떼어 냄
  const KO_SURNAME2 = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방'];
  const ROMAN = { '김': ['KIM', 'GIM'], '이': ['LEE', 'YI', 'RHEE', 'RI', 'I'], '박': ['PARK', 'PAK', 'BAK'], '최': ['CHOI', 'CHOE'], '정': ['JUNG', 'JEONG', 'CHUNG', 'CHEONG'], '강': ['KANG', 'GANG'], '조': ['CHO', 'JO'], '윤': ['YOON', 'YUN'], '장': ['JANG', 'CHANG'], '임': ['LIM', 'IM', 'YIM'], '한': ['HAN'], '오': ['OH', 'O'], '서': ['SEO', 'SUH'], '신': ['SHIN', 'SIN'], '권': ['KWON', 'GWON'], '황': ['HWANG'], '안': ['AHN', 'AN'], '송': ['SONG'], '류': ['RYU', 'YOO', 'YU'], '유': ['YOO', 'YU', 'RYU'], '전': ['JEON', 'JUN', 'CHUN'], '홍': ['HONG'], '고': ['KO', 'GO'], '문': ['MOON', 'MUN'], '양': ['YANG'], '손': ['SON', 'SOHN'], '배': ['BAE'], '백': ['BAEK', 'BAIK', 'PAIK'], '허': ['HEO', 'HUR', 'HUH'], '남': ['NAM'], '심': ['SHIM', 'SIM'], '노': ['NOH', 'ROH', 'NO'], '하': ['HA'], '곽': ['KWAK', 'GWAK'], '성': ['SUNG', 'SEONG'], '차': ['CHA'], '주': ['JOO', 'JU', 'CHOO'], '우': ['WOO', 'U'], '구': ['KOO', 'KU', 'GU'], '민': ['MIN'], '진': ['JIN', 'CHIN'], '나': ['NA', 'RA'], '지': ['JI', 'CHI'], '엄': ['UM', 'EOM'], '채': ['CHAE'], '원': ['WON'], '천': ['CHUN', 'CHEON'], '방': ['BANG'], '공': ['KONG', 'GONG'], '현': ['HYUN', 'HYEON'], '함': ['HAM'], '변': ['BYUN', 'BYEON'], '염': ['YEOM', 'YUM'], '여': ['YEO', 'YOO'], '추': ['CHOO', 'CHU'], '도': ['DO', 'DOH'], '소': ['SO'], '석': ['SEOK', 'SUK'], '선': ['SUN', 'SEON'], '설': ['SEOL', 'SUL'], '마': ['MA'], '길': ['GIL', 'KIL'], '연': ['YEON', 'YUN'], '위': ['WI', 'WEE'], '표': ['PYO'], '명': ['MYUNG', 'MYEONG'], '기': ['KI', 'GI'], '반': ['BAN'], '왕': ['WANG'], '금': ['KEUM', 'GEUM'], '옥': ['OK'], '육': ['YOOK', 'YUK'], '인': ['IN'], '맹': ['MAENG'], '제': ['JE'], '모': ['MO'], '탁': ['TAK'], '국': ['KOOK', 'GUK'], '어': ['EO', 'UH'], '은': ['EUN'], '편': ['PYUN', 'PYEON'], '용': ['YONG'] };
  function namePart(el, field, full, profile) {
    const an = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
    const lab = norm(describe(el));
    const isLast = /last_?name|family_?name|surname/.test(an) || /legallastname/.test(lab) || /^(한글)?성$|^영문성$|(^|\|)성(\||$)/.test(lab);
    const isFirst = /first_?name|given_?name/.test(an) || /legalfirstname|preferredfirstname/.test(lab);
    if (!isLast && !isFirst) return full;
    const v = String(full || '').trim();
    if (field === 'name') {
      const sn = KO_SURNAME2.find(x => v.startsWith(x)) || v.slice(0, 1);
      return isLast ? sn : v.slice(sn.length).trim();
    }
    // 영문
    const parts = v.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return isLast ? parts[0] : parts.slice(1).join(' ');
    const ko = String(profile.name || '').trim();
    const sn = KO_SURNAME2.find(x => ko.startsWith(x)) || ko.slice(0, 1);
    const cand = (ROMAN[sn] || []).filter(r => v.toUpperCase().startsWith(r)).sort((a, b) => b.length - a.length)[0];
    if (!cand) return '';
    return isLast ? v.slice(0, cand.length) : v.slice(cand.length);
  }


  // ---------- 칸 안에 title로 날짜가 적힌 달력 (나인하이어 등 rc-picker: td[title="2026-11-01"]) ----------
  async function pickTitleCalendar(inp, v) {
    const [y, m0, d0] = dateParts(v); if (!/^\d{4}$/.test(y) || !m0) return false;
    const m = String(m0).padStart(2, '0'), d = String(d0 || 1).padStart(2, '0');
    const want = [y + '-' + m + '-' + d, y + '-' + m, y];
    fireAt0(inp); await sleep(450);
    const cells = () => [...document.querySelectorAll('td[title]')].filter(visible);
    if (!cells().some(c => /^\d{4}(-\d{2}){0,2}$/.test(c.title))) return false; // 이 방식의 달력이 아님
    for (let k = 0; k < 14; k++) {
      const cs = cells();
      const hit = want.map(w => cs.find(c => c.title === w)).find(Boolean);
      if (hit) { fireAt0(hit.querySelector('div') || hit); await sleep(350); if (hit.title === want[0]) break; continue; }
      // 연도 화면이 아니면 머리글의 연도 버튼(2026년)을 눌러 연도 화면으로
      const yearBtn = [...document.querySelectorAll('button')].find(b => visible(b) && /^\d{4}년?$/.test(textOf(b)));
      const years = cs.map(c => c.title).filter(t => /^\d{4}$/.test(t)).map(Number);
      if (!years.length) { if (yearBtn) { fireAt0(yearBtn); await sleep(350); continue; } break; }
      // 10년 단위 이동: 머리글의 글자 없는 버튼 중 앞쪽 = 이전, 뒤쪽 = 다음
      const panel = cs[0].closest('[tabindex="-1"]') || cs[0].closest('table').parentElement.parentElement;
      const navs = [...panel.querySelectorAll('button')].filter(b => visible(b) && !textOf(b));
      const nav = +y < Math.min(...years) ? navs[0] : navs[navs.length - 1];
      if (!nav) break; fireAt0(nav); await sleep(300);
    }
    const got = (inp.value || '').replace(/\D/g, '');
    return got.startsWith(y + m);
  }

  // ---------- 페이지 안에 뜨는 "주소입력" 창 (검색 → 우편번호 같은 결과 선택 → 확인) ----------
  // 화면 안 주소 검색 창을 쓰는 사이트: recruiter.co.kr(트리니티항공·코스트코) 또는 검색 창이 페이지에 미리 들어 있음
  const inPageAddrSearch = () => /(^|\.)recruiter\.co\.kr$/.test(location.host) || [...document.querySelectorAll('input')].some(i => /반포대|도로명|건물명|지번|삼성동/.test(i.placeholder || ''));
  function modalAddrOpener() {
    // 트리니티항공 '주소입력', 코스트코(recruiter 예전 화면) '우편번호'
    const btns = [...document.querySelectorAll('button,a,input[type=button]')].filter(b => visible(b) && /^(주소\s?입력|주소\s?찾기|주소\s?검색|우편번호(\s?(찾기|검색))?)$/.test(b.tagName === 'INPUT' ? (b.value || '').trim() : textOf(b)));
    // '우편번호'는 새 창(다음 우편번호 등)을 여는 사이트가 많아, recruiter 사이트이거나 화면 안 검색 창이 미리 들어 있을 때만 사용
    const okBtn = b => !/^우편번호/.test(b.tagName === 'INPUT' ? (b.value || '').trim() : textOf(b)) || inPageAddrSearch();
    // 현주소 줄을 우선 (주민등록지 줄은 건너뜀)
    return btns.filter(okBtn).find(b => /현주소|주소/.test(groupTitle(b, 20)) && !/주민등록/.test(groupTitle(b, 20))) || null;
  }
  async function fillModalAddress(profile) {
    if (!profile.address1 || hasPostcodifyWidget()) return null;
    const opener = modalAddrOpener(); if (!opener) return null;
    // 여는 버튼에서 위로 올라가며 주소칸이 들어 있는 줄을 찾음(코스트코: 버튼 줄과 주소칸 줄이 따로 있음)
    const isAddrBox = i => i.type !== 'hidden' && (/주소/.test(i.placeholder || '') || /address/i.test(i.name || '')) && !/상세|detail|zip|post/i.test((i.placeholder || '') + ' ' + (i.name || ''));
    let row = opener.parentElement && opener.parentElement.parentElement;
    for (let e = opener.parentElement, k = 0; e && k < 4; e = e.parentElement, k++) if ([...e.querySelectorAll('input')].some(isAddrBox)) { row = e; break; }
    const addrBox = row && [...row.querySelectorAll('input')].find(isAddrBox);
    if (addrBox && addrBox.value) return null; // 이미 들어 있음
    opener.click(); await sleep(600);
    const search = [...document.querySelectorAll('input')].find(i => visible(i) && /반포대|도로명|건물명|지번|삼성동/.test(i.placeholder || ''));
    if (!search) return { ok: false, reason: '주소입력 창의 검색칸을 찾지 못했습니다.' };
    const dialog = search.closest('[role="dialog"],[aria-modal="true"]') || (() => { let e = search; for (let k = 0; k < 8 && e.parentElement; k++) { e = e.parentElement; if (/확인|저장/.test(textOf(e)) && /취소/.test(textOf(e))) return e; } return e; })();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, profile.address1);
    search.dispatchEvent(new Event('input', { bubbles: true })); search.dispatchEvent(new Event('change', { bubbles: true }));
    const go = [...dialog.querySelectorAll('button')].find(b => textOf(b) === '검색');
    if (go) go.click(); else pressEnter(search);
    const zip = String(profile.zip || '').replace(/\D/g, '');
    // 결과 줄에 우편번호가 없을 수 있어(트리니티항공: 주소 글자만 표시) 주소 글자로도 비교
    const nAddr = x => String(x || '').replace(/\([^)]*\)/g, '').replace(/[\s,·-]/g, '');
    const want = nAddr(profile.address1);
    // 시·도 표기가 달라도(서울 ↔ 서울특별시) 맞추도록 '도로명 + 건물번호'로도 비교
    const roadKey = x => { const m = String(x || '').replace(/\([^)]*\)/g, '').match(/([가-힣0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/); return m ? m[1] + m[2] : ''; };
    const wantKey = roadKey(profile.address1);
    // 결과 한 줄 = li/tr/option/button. 그 안의 글자(도로명·지번·우편번호 칸)로 비교 (트리니티항공: ul > li > div > span+p)
    const rowOf = e => e.closest('li,tr,[role="option"],button,a') || e;
    let hit = null, hitText = null, reason = '', seen = 0;
    // 결과 줄 후보: 주소처럼 보이는 글자(시·도 + 시·군·구로 시작)만. 창 안 안내문(예: 삼평동 633)은 제외
    const SIDO = /^\(?\s*(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*\s+\S+/;
    // 구주소(지번) 비교: '반포동 산60-1', '을지로2가 199-15'
    const jibunKey = x => { const m = String(x || '').replace(/[()]/g, ' ').match(/([가-힣0-9]+(?:동|리|가|읍|면))\s+(산\s?\d+(?:-\d+)?|\d+(?:-\d+)?)(?![가-힣\d])/); return m ? m[1] + m[2].replace(/\s/g, '') : ''; };
    const wantJ = jibunKey(profile.address1);
    const dedupe = list => { const r = [...new Set(list)].filter(x => x !== dialog); return r.filter(x => !r.some(o => o !== x && o.contains(x))); };
    for (let t = 0; t < 25 && !hit; t++) {
      await sleep(200);
      // 결과 글자가 a·strong·em·label 등 어느 태그에 있어도 읽도록 끝 요소 전체에서 찾음
      const texts = [...dialog.querySelectorAll('*')].filter(e => e.children.length === 0 && !/^(INPUT|BUTTON|SCRIPT|STYLE|OPTION|SELECT|TEXTAREA)$/.test(e.tagName) && visible(e) && !e.contains(search) && textOf(e).length >= 5 && textOf(e).length <= 120);
      const allRows = dedupe(texts.filter(e => SIDO.test(textOf(e))).map(rowOf));
      seen = allRows.length;
      const byZip = zip ? texts.filter(e => textOf(e).replace(/\D/g, '') === zip || textOf(e).includes(zip)) : [];
      const byAddr = want ? texts.filter(e => { const x = nAddr(textOf(e)); return x && (x.startsWith(want) || x === want || (wantKey && roadKey(textOf(e)) === wantKey)); }) : [];
      let leaves = byZip.length ? byZip : byAddr;
      if (!leaves.length) { const only = [...dialog.querySelectorAll('li')].filter(l => visible(l) && /도로명|지번/.test(textOf(l))); if (only.length === 1) { const p0 = [...only[0].querySelectorAll('p,span')].find(e => e.children.length === 0 && textOf(e).length > 5); if (p0) leaves = [p0]; } }
      let rows = dedupe(leaves.map(rowOf));
      // 신주소로 못 맞추면 구주소(지번)로 비교
      if (!rows.length && wantJ) rows = allRows.filter(r => jibunKey(textOf(r)) === wantJ);
      // 내 주소 전체로 검색했으므로 결과가 딱 한 줄이면 그 줄(결과가 다 나오도록 잠시 기다린 뒤)
      if (!rows.length && allRows.length === 1 && t >= 3) rows = allRows;
      if (rows.length === 1) { hit = rows[0]; hitText = leaves.find(e => hit.contains(e)) || texts.find(e => hit.contains(e) && SIDO.test(textOf(e))) || hit; }
      else if (rows.length > 1) { reason = '같은 주소 후보가 ' + rows.length + '개라 직접 골라 주세요.'; if (t > 8) break; }
    }
    if (!hit) { const close = [...dialog.querySelectorAll('button')].find(b => textOf(b) === '취소'); if (close) close.click(); return { ok: false, reason: reason || (seen ? '검색 결과 ' + seen + '줄 중 내 주소와 같은 줄을 찾지 못했습니다.' : '검색 결과가 나오지 않았습니다(0줄). 내 정보 주소로 검색되지 않는 형식일 수 있습니다.') }; }
    // 결과를 누르면 창 안에 '기본주소 + 상세주소 칸'이 나타나고, 상세주소를 넣어야 확인이 켜짐 (트리니티항공)
    // 창 안 상세주소 칸: 안내 글자가 placeholder가 아니라 칸 위에 겹친 글자(label)일 수 있어(코스트코) 이름·주변 글자로도 찾고,
    // 그래도 없으면 검색칸 말고 글자 칸이 하나뿐일 때 그 칸
    const detailInDialog = () => {
      const c = [...dialog.querySelectorAll('input')].filter(i => visible(i) && i !== search && !i.disabled && !i.readOnly && /^(text|search|)$/.test((i.getAttribute('type') || '').toLowerCase()));
      const lab = i => { const l = (i.id && dialog.querySelector('label[for="' + CSS.escape(i.id) + '"]')) || i.closest('label'); return (l ? textOf(l) : '') + ' ' + (precedingText(i) || '') + ' ' + ((i.parentElement && i.parentElement.previousElementSibling && textOf(i.parentElement.previousElementSibling)) || ''); };
      return c.find(i => /상세/.test(i.placeholder || '') || /detail/i.test((i.name || '') + ' ' + (i.id || ''))) || c.find(i => /상세/.test(lab(i))) || (c.length === 1 ? c[0] : null);
    };
    // 결과를 눌렀는지는 창 안 '기본주소' 옆 글자가 생겼는지로 판단 (상세주소 칸은 처음부터 있음)
    // 옆 칸에 숨은 칸(type=hidden)이 같이 있거나(코스트코), 주소가 읽기 전용 칸 안에 표시돼도 인정. 글자를 고칠 수 있는 칸이 있는 줄(상세주소 줄)은 제외
    const baseFilled = () => {
      const lab = [...dialog.querySelectorAll('p,span,div,dt,th,td,label,strong')].find(e => e.children.length === 0 && textOf(e).replace(/\s/g, '') === '기본주소'); if (!lab) return false;
      // 바로 옆 요소가 있으면 그것만, 없을 때만 한 단계 위의 다음 요소(버튼 줄은 제외)
      const sib = lab.nextElementSibling || (lab.parentElement && lab.parentElement.nextElementSibling);
      for (const _ of [0]) {
        if (!sib || sib.querySelector('button')) continue;
        const ins = (sib.tagName === 'INPUT' ? [sib] : [...sib.querySelectorAll('input')]).filter(i => i.type !== 'hidden');
        if (ins.some(i => !i.readOnly && !i.disabled)) continue;
        const v = ((textOf(sib) || '') + ' ' + ins.map(i => i.value).join(' ')).replace(/\s+/g, ' ').trim();
        if (v.length > 3 && v !== '-') return true;
      }
      return false;
    };
    const fire = el => { const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; for (const tp of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new (tp.startsWith('pointer') ? PointerEvent : MouseEvent)(tp, { ...o, pointerType: 'mouse', isPrimary: true })); el.click(); };
    let picked = baseFilled();
    for (const el of [hitText, hitText && hitText.parentElement, hit].filter(Boolean)) {
      if (picked) break;
      fire(el);
      for (let t = 0; t < 8 && !(picked = baseFilled()); t++) await sleep(200);
    }
    const inDetail = detailInDialog();
    if (!picked && !document.body.contains(dialog)) picked = true; // 누르자마자 창이 닫히는 사이트
    if (!picked) { const close = [...dialog.querySelectorAll('button')].find(b => textOf(b) === '취소'); if (close) close.click(); return { ok: false, reason: '검색 결과를 눌렀지만 기본주소가 채워지지 않았습니다.' }; }
    if (inDetail && profile.address2 && !inDetail.value) {
      inDetail.focus(); inDetail.dispatchEvent(new FocusEvent('focus')); inDetail.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      inDetail.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inDetail, profile.address2);
      for (const tp of ['input', 'change']) inDetail.dispatchEvent(new Event(tp, { bubbles: true }));
      inDetail.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      // 커서가 머무는 동안에만 검사하는 사이트(코스트코)를 위해 잠시 머문 뒤 나감
      await sleep(400);
      inDetail.blur(); inDetail.dispatchEvent(new FocusEvent('blur')); inDetail.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await sleep(150);
    }
    const okBtn = [...dialog.querySelectorAll('button,a')].find(b => /^(확인|저장)$/.test(textOf(b)));
    for (let t = 0; okBtn && okBtn.disabled && t < 15; t++) await sleep(200);
    if (okBtn && !okBtn.disabled) {
      okBtn.click(); await sleep(500);
      // '저장하시겠습니까?' 같은 확인 창(화면 안 레이어)이 뜨면 그 창의 '확인'을 누름(코스트코)
      for (let t = 0; t < 6; t++) {
        const cf = [...document.querySelectorAll('button,a')].find(b => visible(b) && textOf(b) === '확인' && b !== okBtn && (() => { let e = b; for (let k = 0; k < 4 && e.parentElement; k++) { e = e.parentElement; if (/하시겠습니까/.test(textOf(e))) return textOf(e).length < 200; } return false; })());
        if (cf) { cf.click(); await sleep(500); break; }
        await sleep(200);
      }
    }
    else if (inDetail && !profile.address2) return { ok: false, reason: '주소는 골랐습니다. 내 정보에 상세주소가 없어 확인을 누르지 않았습니다.' };
    // 지원서의 상세주소 칸
    const detail = row && [...(row.parentElement || row).querySelectorAll('input')].find(i => visible(i) && /상세|detail/i.test((i.placeholder || '') + ' ' + (i.name || '')) && !i.value && !i.disabled && !i.readOnly);
    if (detail && profile.address2) { detail.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(detail, profile.address2); detail.dispatchEvent(new Event('input', { bubbles: true })); detail.dispatchEvent(new Event('change', { bubbles: true })); detail.blur(); mark(detail, true); }
    const filledNow = addrBox ? !!addrBox.value : true;
    if (addrBox) mark(addrBox, filledNow);
    return { ok: filledNow, reason: filledNow ? '' : '주소가 지원서 칸에 반영되지 않았습니다.' };
  }

  // ---------- 버튼으로 여는 목록 (예: <button><p>국적을 선택해주세요.</p><svg/></button>) ----------
  function dropdownTargets() {
    const btns = [...document.querySelectorAll('button[type="button"]')].filter(b => visible(b) && !b.disabled && !b.dataset.scope && b.querySelector('svg') && !b.closest('label'));
    // 버튼이 아닌 상자형 목록: 안내 글자 span + 화살표 svg가 한 상자에 있음
    const spans = [...document.querySelectorAll('span,p,div')].filter(e => e.children.length === 0 && visible(e) && /선택해\s*주세요|선택하세요/.test(textOf(e)) && !e.closest('button,select,label'))
      .map(e => { let box = e.parentElement; for (let k = 0; k < 3 && box && !box.querySelector('svg'); k++) box = box.parentElement; return box && box.querySelector('svg') && !box.querySelector('input,select,textarea') ? box : null; })
      .filter(Boolean);
    return [...btns, ...new Set(spans)].map(b => ({ b, ph: textOf(b) }))
      .filter(x => /선택해\s*주세요|선택하세요|^선택$/.test(x.ph))
      .map(x => {
        const pool = SCALAR_FIELDS.filter(f => !['date', 'month', 'period', 'phone', 'email'].includes(f.type));
        const pick = d => pool.map(f => [f, scoreField(f, d)]).filter(y => y[1] > 0).sort((p, q) => q[1] - p[1])[0];
        const fp = fpDropdown(x.b); x.b.__pubfillFingerprint = fp;
        if (isUserSkip(fp, curMappings)) return { btn: x.b, ph: x.ph, field: null, userSkip: true };
        const mapped = mappingFor(fp, curMappings);
        if (mapped && !mapped.list) return { btn: x.b, ph: x.ph, field: mapped.field };
        // '선택해주세요.'만 있는 상자는 바로 앞 글자(나인하이어: 지원분야·지원경로)로 판단
        const best = pick(norm(x.ph)) || pick(norm(x.ph + ' ' + groupTitle(x.b, 30))) || pick(norm(precedingText(x.b) || ''));
        return { btn: x.b, ph: x.ph, field: best ? best[0] : null };
      });
  }
  async function fillDropdowns(profile, opts, targets) {
    let n = 0, check = 0; const missing = [];
    const shortText = e => { const t = textOf(e); return t && t.length <= 30; };
    for (const t of targets) {
      if (!t.field) continue;
      const v = profile[t.field.key];
      if (!v) { missing.push(t.field.label); continue; }
      const ws = variants(v);
      const before = new Set([...document.querySelectorAll('li,button,[role="option"],div,span,p')].filter(e => visible(e) && shortText(e)));
      fireAt0(t.btn); await sleep(400);
      // 누른 뒤 새로 보이는 짧은 글자 중 내 정보와 같은 것
      const fresh = [...document.querySelectorAll('[role="option"],li,button,div,span,p')].filter(e => visible(e) && !before.has(e) && !t.btn.contains(e) && shortText(e));
      let o = null;
      for (const w of ws) { o = fresh.find(e => norm(textOf(e)) === w); if (o) break; }
      if (!o) for (const w of ws) { const c = fresh.filter(e => { const x = norm(textOf(e)); return x.startsWith(w) && NEG.test(x) === NEG.test(w); }); if (c.length === 1) { o = c[0]; break; } }
      // 같은 글자가 겹겹이(li > button) 있으면 실제로 누르는 요소를 고름
      if (o) { const inner = o.querySelector && o.querySelector('button,[role="option"],a'); const tgt = (inner && norm(textOf(inner)) === norm(textOf(o))) ? inner : (o.closest('button,[role="option"],a') || o.closest('li') || o); tgt.click(); await sleep(300); }
      const ok = !!o && !/선택해\s*주세요|선택하세요/.test(textOf(t.btn));
      // 못 고르면 연 목록을 닫음
      if (!o) { document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); t.btn.click(); await sleep(150); }
      mark(t.btn, ok); if (ok) n++; else check++;
    }
    return { n, check, missing };
  }

  // 팝업의 "칸 알려 주기" 버튼에서 시작합니다. 페이지에 값은 읽거나 전달하지 않습니다.
  // 노란 칸뿐 아니라 화면의 모든 입력칸·목록·라디오·버튼 묶음·버튼형 목록을 고를 수 있고, Esc를 누를 때까지 여러 칸을 이어서 알려 줄 수 있습니다.
  window.__pubTeachStart = function (mappings) {
    if (window.__pubTeachCancel) window.__pubTeachCancel();
    curMappings = (mappings && mappings[location.host]) || {};
    const labelOf = path => { if (path === '__skip__') return '건너뛰기'; const m = mappedField(path); return m ? (m.list ? (LISTS.find(l => l.key === m.list).label + ' · ') : '') + m.field.label : ''; };
    // 지문 붙이기 (채우기를 먼저 안 눌러도 됨)
    const items = analyze(curMappings).filter(x => !isHardSkip(x.desc));
    const targets = new Map(); // 화면 요소 → { fp, now }
    for (const x of items) {
      const box = x.el.type === 'radio' ? (x.el.closest('td,dd,li,div') || x.el) : x.el;
      targets.set(box, { fp: x.el.__pubfillFingerprint, now: x.m ? (x.m.list ? x.m.list + '.' + x.m.field.key : x.m.field.key) : (x.skip ? '__skip__' : '') });
    }
    for (const [p, bs] of buttonGroups()) { const fp = fpButtons(p, bs); const mp = curMappings[fp]; targets.set(p, { fp, now: mp || '' }); }
    for (const t of dropdownTargets()) targets.set(t.btn, { fp: t.btn.__pubfillFingerprint, now: t.userSkip ? '__skip__' : (t.field ? t.field.key : '') });
    for (const t of arkTargets(curMappings)) if (t.btn.__pubfillFingerprint) targets.set(t.btn, { fp: t.btn.__pubfillFingerprint, now: t.field ? (t.list ? t.list.key + '.' + t.field.key : t.field.key) : '' });
    const makeNotice = (text, ms = 4500) => {
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:14px;right:14px';
      const shadow = host.attachShadow({ mode: 'closed' });
      const box = document.createElement('div');
      box.textContent = text;
      box.style.cssText = 'font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;background:#20252b;color:#fff;padding:11px 15px;border-radius:9px;box-shadow:0 4px 18px #0005;max-width:360px';
      shadow.append(box); document.documentElement.append(host);
      setTimeout(() => host.remove(), ms);
    };
    if (!targets.size) { makeNotice('이 화면에서 알려 줄 수 있는 칸을 찾지 못했습니다.'); return { ok: false, reason: 'no-fields' }; }
    // 고를 수 있는 칸에 파란 점선 표시
    const saved = new Map();
    for (const el of targets.keys()) { saved.set(el, el.style.boxShadow); el.style.boxShadow = '0 0 0 2px #1f5eff88'; }
    let active = true, overlay = null;
    const unhighlight = () => { for (const [el, v] of saved) el.style.boxShadow = v || ''; };
    const removeWaiters = () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); };
    const stop = () => { if (!active) return; active = false; removeWaiters(); if (overlay) overlay.remove(); unhighlight(); delete window.__pubTeachCancel; };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stop(); makeNotice('칸 알려 주기를 마쳤습니다. 팝업에서 다시 채우기를 눌러 주세요.'); } };
    const showChooser = (el, info) => {
      document.removeEventListener('click', onClick, true);
      overlay = document.createElement('div');
      overlay.style.cssText = 'all:initial;position:fixed;z-index:2147483647;inset:0;pointer-events:none';
      const shadow = overlay.attachShadow({ mode: 'closed' });
      const panel = document.createElement('section');
      panel.style.cssText = 'pointer-events:auto;position:absolute;top:18px;left:50%;transform:translateX(-50%);width:min(400px,calc(100vw - 32px));box-sizing:border-box;background:#fff;color:#20252b;border:1px solid #d9dee5;border-radius:12px;padding:16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 32px #0004';
      const title = document.createElement('strong');
      title.textContent = '이 칸에 넣을 내 정보 항목을 골라 주세요.';
      title.style.cssText = 'display:block;margin-bottom:6px;font-size:15px';
      const now = document.createElement('div');
      now.textContent = '지금: ' + (labelOf(info.now) || '인식 못 함') + (curMappings[info.fp] ? ' (알려 준 연결)' : ' (자동 인식)');
      now.style.cssText = 'color:#1f5eff;font-size:13px;margin-bottom:6px';
      const note = document.createElement('div');
      note.textContent = '저장되는 것은 "이 사이트의 이 칸 = 항목" 연결뿐이며 입력값은 저장하지 않습니다.';
      note.style.cssText = 'color:#59636e;font-size:12px;margin-bottom:10px';
      const select = document.createElement('select');
      select.style.cssText = 'box-sizing:border-box;width:100%;padding:9px;border:1px solid #cbd2da;border-radius:7px;font:inherit;background:#fff';
      const opt = (v, t, parent) => { const o = document.createElement('option'); o.value = v; o.textContent = t; (parent || select).append(o); };
      opt('', '항목 선택');
      const special = document.createElement('optgroup'); special.label = '특별'; select.append(special);
      opt('__skip__', '이 칸은 건너뛰기 (채우지 않음)', special);
      opt('__clear__', '알려 준 연결 지우기 (자동 인식으로)', special);
      for (const group of SCALAR) { const og = document.createElement('optgroup'); og.label = group.group; select.append(og); for (const f of group.fields) if (!f.hidden) opt(f.key, f.label, og); }
      for (const list of LISTS) { const og = document.createElement('optgroup'); og.label = list.label; select.append(og); for (const f of list.fields) if (!f.hidden) opt(list.key + '.' + f.key, f.label, og); }
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px';
      const done = document.createElement('button'), cancel = document.createElement('button'), save = document.createElement('button');
      done.type = cancel.type = save.type = 'button'; done.textContent = '끝내기'; cancel.textContent = '다른 칸 고르기'; save.textContent = '저장';
      for (const b of [done, cancel, save]) b.style.cssText = 'font:inherit;padding:8px 12px;border:1px solid #cbd2da;border-radius:7px;background:#fff;cursor:pointer';
      save.style.cssText += ';background:#1f5eff;color:#fff;border-color:#1f5eff;font-weight:600';
      actions.append(done, cancel, save); panel.append(title, now, note, select, actions); shadow.append(panel); document.documentElement.append(overlay);
      const back = () => { overlay.remove(); overlay = null; if (active) document.addEventListener('click', onClick, true); };
      done.addEventListener('click', () => { stop(); makeNotice('칸 알려 주기를 마쳤습니다. 팝업에서 다시 채우기를 눌러 주세요.'); });
      cancel.addEventListener('click', back);
      save.addEventListener('click', () => {
        if (!select.value) { select.focus(); return; }
        if (!chrome.runtime || !chrome.runtime.sendMessage) { stop(); makeNotice('연결을 저장하지 못했습니다. 확장 프로그램을 새로고침해 주세요.'); return; }
        chrome.runtime.sendMessage({ type: 'saveFieldMapping', host: location.host, fingerprint: info.fp, item: select.value }).then(result => {
          if (result && result.ok) {
            if (select.value === '__clear__') delete curMappings[info.fp]; else curMappings[info.fp] = select.value;
            info.now = select.value === '__clear__' ? '' : select.value;
            el.style.boxShadow = '0 0 0 2px #22a35a';
            makeNotice('저장했습니다. 다른 칸을 계속 누르거나, Esc로 마치세요.', 3000);
            back();
          } else { stop(); makeNotice('연결을 저장하지 못했습니다. 확장 프로그램을 새로고침해 주세요.'); }
        }).catch(() => { stop(); makeNotice('연결을 저장하지 못했습니다. 확장 프로그램을 새로고침해 주세요.'); });
      });
      select.focus();
    };
    const onClick = e => {
      const path = e.composedPath();
      if (overlay && path.includes(overlay)) return;
      const el = path.find(n => n && n.nodeType === 1 && targets.has(n));
      if (!el) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      showChooser(el, targets.get(el));
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    window.__pubTeachCancel = stop;
    makeNotice('파란 테두리 칸을 누르면 넣을 항목을 고를 수 있습니다. 여러 칸을 이어서 알려 줄 수 있고, Esc로 마칩니다.', 6000);
    return { ok: true, fields: targets.size };
  };
})();
