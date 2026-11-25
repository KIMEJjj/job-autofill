// 내 이력서 내보내기: 저장된 내 정보로 일반 이력서를 Word(.docx) 파일 또는 인쇄 화면(PDF로 저장)으로 만듭니다.
// 크롬 안에서만 만들고 외부로 보내지 않습니다. 사진·자기소개서는 넣지 않습니다(사진 칸은 비움).
(function (root) {
  const { SCALAR, LISTS } = root.PUBFILL_SCHEMA;
  const FIELD = {}; SCALAR.forEach(g => g.fields.forEach(f => { FIELD[f.key] = f; }));
  const fmtDate = v => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v || ''); return m ? (m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`) : (v || ''); };
  const period = (a, b) => (a || b) ? `${fmtDate(a)} ~ ${fmtDate(b)}`.trim() : '';
  // 영문 이력서: 날짜 'Mar 2018', 'Aug 11, 2023', 고정 값 번역(목록에 없는 값은 그대로)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const enDate = v => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v || ''); return m ? (m[3] ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : `${MON[+m[2] - 1]} ${m[1]}`) : (v || ''); };
  const enPeriod = (a, b) => (a || b) ? `${enDate(a)} – ${b ? enDate(b) : 'Present'}`.trim() : '';
  const TR = { '고등학교': 'High School', '전문대학': "Associate's", '대학교': "Bachelor's", '대학원(석사)': "Master's", '대학원(박사)': 'Ph.D.', '전문학사': "Associate's", '학사': "Bachelor's", '석사': "Master's", '박사': 'Ph.D.',
    '졸업': 'Graduated', '졸업예정': 'Expected', '재학': 'Enrolled', '신입학': 'Freshman', '편입학': 'Transfer', '재입학': 'Readmitted', '휴학': 'On leave', '수료': 'Completed', '중퇴': 'Withdrawn', '남': 'Male', '여': 'Female',
    '군필': 'Completed', '미필': 'Not completed', '면제': 'Exempted', '비대상': 'Not applicable', '복무중': 'Serving', '육군': 'Army', '해군': 'Navy', '공군': 'Air Force', '해병대': 'Marine Corps',
    '병장': 'Sergeant', '상병': 'Corporal', '일병': 'Private First Class', '이병': 'Private', '하사': 'Staff Sergeant', '중사': 'Sergeant First Class', '소위': 'Second Lieutenant', '중위': 'First Lieutenant', '대위': 'Captain',
    '만기제대': 'Honorable discharge', '소집해제': 'Completed alternative service', '현역병': 'Active duty', '사회복무요원': 'Social service agent',
    '정규직': 'Full-time', '계약직': 'Contract', '인턴': 'Intern', '아르바이트': 'Part-time', '프리랜서': 'Freelance', '대한민국': 'Republic of Korea', '한국': 'Republic of Korea',
    '상': 'Advanced', '중': 'Intermediate', '하': 'Basic', '영어': 'English', '일본어': 'Japanese', '중국어': 'Chinese', '독일어': 'German', '프랑스어': 'French', '스페인어': 'Spanish', '러시아어': 'Russian', '베트남어': 'Vietnamese' };
  const tr = s => TR[(s || '').trim()] || (s || '');
  const COLS_EN = {
    education: [['Period', it => enPeriod(it.start, it.end)], ['School', it => it.schoolEn || it.school], ['Major', it => it.majorEn || it.major], ['Degree', it => tr(it.degree || it.level)], ['Status', it => tr(it.status)], ['GPA', it => it.gpa ? it.gpa + (it.gpaMax ? ' / ' + it.gpaMax : '') : '']],
    career: [['Period', it => enPeriod(it.start, it.end)], ['Company', it => it.companyEn || it.company], ['Position', it => it.positionEn || tr(it.position)], ['Type', it => tr(it.type)], ['Responsibilities', it => it.dutyEn || it.duty]],
    certificates: [['Certification', it => it.nameEn || it.name], ['Grade', 'grade'], ['Issuer', 'issuer'], ['Date', it => enDate(it.date)]],
    languages: [['Language', it => tr(it.language)], ['Test', 'test'], ['Score', 'score'], ['Date', it => enDate(it.date)], ['Speaking', it => tr(it.speak)]],
    trainings: [['Program', 'name'], ['Institution', 'org'], ['Period', it => enPeriod(it.start, it.end)], ['Hours', 'hours']],
    projects: [['Project', 'name'], ['Client', 'client'], ['Period', it => enPeriod(it.start, it.end)], ['Role', 'role'], ['Description', 'desc']],
    awards: [['Award', it => it.nameEn || it.name], ['Organization', 'org'], ['Date', it => enDate(it.date)], ['Description', 'desc']],
    activities: [['Type', 'type'], ['Organization', 'org'], ['Role', 'role'], ['Period', it => enPeriod(it.start, it.end)], ['Description', 'desc']],
    overseas: [['Purpose', 'purpose'], ['Period', it => enPeriod(it.period, it.end)]],
    skills: [['Category', 'category'], ['Level', it => tr(it.level)]],
  };
  const TITLES_EN = { military: 'Military Service', pref: 'Eligibility', education: 'Education', career: 'Work Experience', certificates: 'Certifications', languages: 'Languages', trainings: 'Training', projects: 'Projects', awards: 'Awards', activities: 'Activities', overseas: 'Overseas Experience', skills: 'Computer Skills' };

  // 표에 넣을 열(값이 하나라도 있는 열만 씀)
  const COLS = {
    education: [['구분', 'level'], ['기간', it => period(it.start, it.end)], ['학교명', 'school'], ['전공', 'major'], ['소재지', 'region'], ['졸업구분', 'status'], ['학점', it => it.gpa ? it.gpa + (it.gpaMax ? ' / ' + it.gpaMax : '') : '']],
    career: [['기간', it => period(it.start, it.end)], ['회사명', 'company'], ['부서', 'dept'], ['직위', 'position'], ['고용형태', 'type'], ['담당업무', 'duty']],
    certificates: [['자격증명', 'name'], ['등급', 'grade'], ['발급기관', 'issuer'], ['취득일', it => fmtDate(it.date)], ['자격번호', 'number']],
    languages: [['외국어', 'language'], ['시험명', 'test'], ['점수/등급', 'score'], ['응시일', it => fmtDate(it.date)], ['회화', 'speak']],
    trainings: [['교육명', 'name'], ['교육기관', 'org'], ['기간', it => period(it.start, it.end)], ['시간', 'hours']],
    projects: [['프로젝트명', 'name'], ['발주처', 'client'], ['기간', it => period(it.start, it.end)], ['역할', 'role'], ['내용', 'desc']],
    awards: [['상훈명', 'name'], ['수여기관', 'org'], ['수상일', it => fmtDate(it.date)], ['내역', 'desc']],
    activities: [['구분', 'type'], ['기관·조직명', 'org'], ['역할', 'role'], ['기간', it => period(it.start, it.end)], ['내용', 'desc']],
    overseas: [['목적', 'purpose'], ['기간', it => period(it.period, it.end)]],
    skills: [['구분', 'category'], ['수준', 'level']],
  };
  // 고르기 화면에 보일 줄 이름, 고른 결과를 기억할 열쇠(줄 순서가 바뀌어도 같은 항목)
  const LABEL = {
    education: it => [it.school, it.major, it.level].filter(Boolean).join(' · '),
    career: it => [it.company, it.position, period(it.start, it.end)].filter(Boolean).join(' · '),
    certificates: it => [it.name, it.grade, fmtDate(it.date)].filter(Boolean).join(' · '),
    languages: it => [it.test || it.language, it.score, fmtDate(it.date)].filter(Boolean).join(' · '),
    trainings: it => [it.name, it.org].filter(Boolean).join(' · '),
    projects: it => [it.name, it.client].filter(Boolean).join(' · '),
    awards: it => [it.name, it.org, fmtDate(it.date)].filter(Boolean).join(' · '),
    activities: it => [it.org, it.role, it.type].filter(Boolean).join(' · '),
    overseas: it => [it.purpose, fmtDate(it.period)].filter(Boolean).join(' · '),
    skills: it => [it.category, it.level].filter(Boolean).join(' · '),
  };
  const itemLabel = (key, it) => (LABEL[key] ? LABEL[key](it) : '') || Object.values(it).filter(Boolean).join(' · ');
  const itemId = (key, it) => key + ':' + itemLabel(key, it);
  const TITLES = { military: '병역사항', pref: '우대사항', education: '학력사항', career: '경력사항', certificates: '자격사항', languages: '어학', trainings: '교육이수', projects: '프로젝트', awards: '수상', activities: '대외활동', overseas: '해외경험', skills: '컴퓨터 활용능력' };
  const hasAny = it => it && Object.values(it).some(x => (x || '').toString().trim());
  // 고르기 화면에 보일 구역 목록: [{ key, title, items: [{ id, label }] | null }]
  function sections(p) {
    const out = [];
    const v = k => (p[k] || '').toString().trim();
    if (['military', 'militaryType', 'militaryBranch', 'militaryRank', 'militaryStart', 'militaryEnd', 'militaryDischarge'].some(v)) out.push({ key: 'military', title: TITLES.military, items: null });
    if (SCALAR.find(g => g.group === '우대사항').fields.some(f => v(f.key) === '대상')) out.push({ key: 'pref', title: TITLES.pref, items: null });
    for (const L of LISTS) {
      const items = (p[L.key] || []).filter(hasAny);
      if (items.length) out.push({ key: L.key, title: TITLES[L.key] || L.label, items: items.map(it => ({ id: itemId(L.key, it), label: itemLabel(L.key, it) })) });
    }
    return out;
  }
  const val = (it, get) => String((typeof get === 'function' ? get(it) : it[get]) || '').trim();

  // 이력서 내용 정리(형식과 무관): { personal: [[이름표, 값]...], blocks: [{ title, head, rows }] }
  // sel: { off: Set(뺄 구역), offItems: Set(뺄 줄 열쇠) } — 없으면 전부
  function model(p, sel) {
    const offS = (sel && sel.off) || new Set(), offI = (sel && sel.offItems) || new Set();
    const en = !!(sel && sel.lang === 'en');
    const v = k => (p[k] || '').toString().trim();
    const personal = [];
    const add = (label, value) => { if (value) personal.push([label, value]); };
    const korAddr = [v('zip') ? `(${v('zip')})` : '', v('address1'), v('address2')].filter(Boolean).join(' ');
    let addr;
    if (en) {
      add('Name', v('nameEn') || v('name')); add('Date of Birth', enDate(v('birth'))); add('Gender', tr(v('gender'))); add('Nationality', tr(v('nationality')));
      add('Phone', v('phone')); add('Email', v('email')); add('LinkedIn', v('linkedin')); add('Twitter / X', v('twitter')); add('GitHub', v('github')); add('Portfolio', v('portfolio')); add('Website', v('website'));
      addr = v('addressEn') || korAddr;
    } else {
      add('성명', v('name')); add('영문 성명', v('nameEn')); add('한자 성명', v('nameHanja'));
      add('생년월일', fmtDate(v('birth'))); add('성별', v('gender')); add('국적', v('nationality'));
      add('휴대폰', v('phone')); add('이메일', v('email')); add('자택전화', v('tel')); add('비상연락처', v('emergencyPhone'));
      add('LinkedIn', v('linkedin')); add('Twitter / X', v('twitter')); add('GitHub', v('github')); add('포트폴리오', v('portfolio')); add('웹사이트', v('website'));
      addr = korAddr;
    }
    const blocks = [];
    const mil = en
      ? [['Status', tr(v('military'))], ['Branch', tr(v('militaryBranch'))], ['Rank', tr(v('militaryRank'))], ['Period', enPeriod(v('militaryStart'), v('militaryEnd'))], ['Discharge', tr(v('militaryDischarge'))]].filter(x => x[1])
      : [['병역구분', v('military')], ['복무형태', v('militaryType')], ['군별', v('militaryBranch')], ['계급', v('militaryRank')], ['복무기간', period(v('militaryStart'), v('militaryEnd'))], ['제대구분', v('militaryDischarge')]].filter(x => x[1]);
    if (mil.length && !offS.has('military')) blocks.push({ title: en ? TITLES_EN.military : '병역사항', head: mil.map(x => x[0]), rows: [mil.map(x => x[1])] });
    for (const L of LISTS) {
      if (offS.has(L.key)) continue;
      const items = (p[L.key] || []).filter(hasAny).filter(it => !offI.has(itemId(L.key, it)));
      const cols = ((en ? COLS_EN : COLS)[L.key] || []).filter(([, get]) => items.some(it => val(it, get)));
      if (!items.length || !cols.length) continue;
      blocks.push({ title: (en ? TITLES_EN : TITLES)[L.key] || L.label, head: cols.map(c => c[0]), rows: items.map(it => cols.map(([, get]) => val(it, get))) });
    }
    const pref = offS.has('pref') || en ? [] : SCALAR.find(g => g.group === '우대사항').fields.filter(f => v(f.key) === '대상').map(f => f.label.replace(/\s*\(.*\)$/, ''));
    const photo = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v('photo')) ? v('photo') : '';
    return { photo: en ? '' : photo, en, name: en ? (v('nameEn') || v('name')) : v('name'), addr, personal, blocks, pref };
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`; };

  // ---------- Word(.docx) ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const W = 9638; // A4 본문 폭(twip, 좌우 여백 2cm)
  function run(text, opt = {}) { return `<w:r><w:rPr>${opt.b ? '<w:b/>' : ''}${opt.sz ? `<w:sz w:val="${opt.sz}"/><w:szCs w:val="${opt.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`; }
  function para(text, opt = {}) { return `<w:p><w:pPr>${opt.jc ? `<w:jc w:val="${opt.jc}"/>` : ''}<w:spacing w:before="${opt.before || 0}" w:after="${opt.after || 0}"/></w:pPr>${text ? run(text, opt) : ''}</w:p>`; }
  function cell(text, w, opt = {}) {
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${opt.span > 1 ? `<w:gridSpan w:val="${opt.span}"/>` : ''}${opt.vm ? `<w:vMerge${opt.vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${opt.head ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EDF5"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${para(text, { jc: opt.head ? 'center' : (opt.jc || 'left'), b: opt.head })}</w:tc>`;
  }
  const BORDERS = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="7F8A99"/>`).join('') + '</w:tblBorders>';
  function table(widths, rows) {
    return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(r => `<w:tr><w:trPr><w:trHeight w:val="380"/></w:trPr>${r}</w:tr>`).join('')}</w:tbl>`;
  }
  function docxBody(m) {
    const out = [para(m.en ? 'RESUME' : '이 력 서', { jc: 'center', b: true, sz: 36, after: 240 })];
    // 인적사항: (한글) 사진 칸(세로 병합) + 이름표/값 2쌍, (영문) 사진 칸 없음
    out.push(para(m.en ? 'Personal Information' : '인적사항', { b: true, sz: 24, before: 120, after: 80 }));
    const photoW = m.en ? 0 : 1700, lab = m.en ? 1500 : 1300, valW = Math.floor((W - photoW - lab * 2) / 2);
    const pc = (i, txt) => m.en ? '' : (i === 0 && m.photo ? photoCell(photoW) : cell(txt, photoW, { vm: i === 0 ? 'restart' : 'cont', jc: 'center' }));
    const photoCell = w => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${root.PubDoc.docxPicRun('rIdPhoto', 1008000, 1344000, 3001).replace(/ xmlns:(w|wp|r)="[^"]+"/g, '')}</w:p></w:tc>`;
    const pairs = []; for (let i = 0; i < m.personal.length; i += 2) pairs.push(m.personal.slice(i, i + 2));
    const rows = pairs.map((pr, i) => pc(i, i === 0 ? '사진' : '')
      + cell(pr[0][0], lab, { head: true }) + cell(pr[0][1], pr[1] ? valW : valW + lab + valW, { span: pr[1] ? 1 : 3 })
      + (pr[1] ? cell(pr[1][0], lab, { head: true }) + cell(pr[1][1], valW) : ''));
    if (m.addr) rows.push(pc(rows.length, '') + cell(m.en ? 'Address' : '주소', lab, { head: true }) + cell(m.addr, valW * 2 + lab, { span: 3 }));
    if (!m.en) while (rows.length < 4) rows.push(pc(rows.length, '') + cell('', lab, { head: true }) + cell('', valW * 2 + lab, { span: 3 }));
    out.push(table(m.en ? [lab, valW, lab, W - lab * 2 - valW] : [photoW, lab, valW, lab, valW], rows));
    if (m.pref.length) { out.push(para('우대사항', { b: true, sz: 24, before: 240, after: 80 })); out.push(table([W], [cell(m.pref.join(', '), W)])); }
    for (const b of m.blocks) {
      out.push(para(b.title, { b: true, sz: 24, before: 240, after: 80 }));
      const n = b.head.length, w = Math.floor(W / n), widths = b.head.map((_, i) => i === n - 1 ? W - w * (n - 1) : w);
      out.push(table(widths, [b.head.map((h, i) => cell(h, widths[i], { head: true })).join(''), ...b.rows.map(r => r.map((x, i) => cell(x, widths[i], { jc: 'center' })).join(''))]));
    }
    if (!m.en) {
      out.push(para('위 기재 사항은 사실과 틀림이 없습니다.', { jc: 'center', before: 480, after: 120 }));
      out.push(para(today(), { jc: 'center', after: 120 }));
      out.push(para(`지원자 : ${m.name}          (서명)`, { jc: 'right' }));
    }
    return out.join('');
  }
  async function toDocx(profile, sel) {
    const m = model(profile, sel);
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const photo = m.photo && root.PubDoc.dataUrlBytes(m.photo);
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + (photo ? '<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.jpeg"/>' : '') + '</Relationships>',
      'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕" w:cs="Malgun Gothic"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${docxBody(m)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    };
    if (photo) files['word/media/photo.jpeg'] = photo;
    const blob = await root.PubDoc.makeZip(files);
    return { blob: new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name: m.en ? `Resume_${(m.name || 'resume').replace(/\s+/g, '_')}.docx` : `이력서_${m.name || '내정보'}.docx` };
  }

  // ---------- 인쇄 화면(PDF로 저장) ----------
  const h = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function toHtml(profile, sel) {
    const m = model(profile, sel);
    const pairs = []; for (let i = 0; i < m.personal.length; i += 2) pairs.push(m.personal.slice(i, i + 2));
    const prow = pairs.map(pr => `<tr><th>${h(pr[0][0])}</th><td${pr[1] ? '' : ' colspan="3"'}>${h(pr[0][1])}</td>${pr[1] ? `<th>${h(pr[1][0])}</th><td>${h(pr[1][1])}</td>` : ''}</tr>`);
    if (m.addr) prow.push(`<tr><th>${m.en ? 'Address' : '주소'}</th><td colspan="3">${h(m.addr)}</td></tr>`);
    const nrow = Math.max(prow.length, 1);
    const ph = m.photo ? `<img src="${m.photo}" style="width:28mm;height:37mm;object-fit:cover">` : '사진';
    if (!m.en) prow[0] = prow[0] ? prow[0].replace('<tr>', `<tr><td class="photo" rowspan="${nrow}">${ph}</td>`) : `<tr><td class="photo">${ph}</td></tr>`;
    const blocks = m.blocks.map(b => `<h2>${h(b.title)}</h2><table><tr>${b.head.map(x => `<th>${h(x)}</th>`).join('')}</tr>${b.rows.map(r => `<tr>${r.map(x => `<td class="c">${h(x)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
    return `<!doctype html><html lang="${m.en ? 'en' : 'ko'}"><head><meta charset="utf-8"><title>${m.en ? 'Resume_' : '이력서_'}${h(m.name || '')}</title><style>
      @page { size: A4; margin: 18mm 16mm; }
      body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 10pt; color: #111; margin: 0; }
      h1 { text-align: center; letter-spacing: 12px; font-size: 20pt; margin: 0 0 14px; }
      h2 { font-size: 11pt; margin: 16px 0 6px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      th, td { border: 1px solid #7f8a99; padding: 5px 6px; word-break: keep-all; overflow-wrap: anywhere; }
      th { background: #e8edf5; font-weight: 700; text-align: center; }
      td.c { text-align: center; }
      td.photo { width: 30mm; height: 40mm; text-align: center; color: #888; }
      .end { margin-top: 28px; text-align: center; }
      .sign { text-align: right; margin-top: 10px; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style></head><body><h1>${m.en ? 'RESUME' : '이력서'}</h1><h2>${m.en ? 'Personal Information' : '인적사항'}</h2><table>${prow.join('')}</table>${m.pref.length ? `<h2>우대사항</h2><table><tr><td>${h(m.pref.join(', '))}</td></tr></table>` : ''}${blocks}
    ${m.en ? '' : `<p class="end">위 기재 사항은 사실과 틀림이 없습니다.<br><br>${today()}</p><p class="sign">지원자 : ${h(m.name)} &nbsp; &nbsp; &nbsp; &nbsp; (서명)</p>`}</body></html>`;
  }
  // 숨은 틀에 인쇄 화면을 띄워 크롬 인쇄 창 열기(대상: "PDF로 저장")
  function print(profile, sel) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    f.srcdoc = toHtml(profile, sel);
    f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
    document.body.appendChild(f);
  }

  root.PubResume = { model, sections, toDocx, toHtml, print };
})(typeof window !== 'undefined' ? window : globalThis);
