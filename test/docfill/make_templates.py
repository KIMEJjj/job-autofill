# 양식 채우기 시험용 이력서 양식(docx·pptx·hwpx)을 만듭니다. 실제 회사 양식이 아니라 흔한 구조를 흉내 낸 빈 양식입니다.
# 사용: python3 test/docfill/make_templates.py  → test/docfill/resume.docx|pptx|hwpx
import os, zipfile
from xml.sax.saxutils import escape as esc
HERE = os.path.dirname(os.path.abspath(__file__))

# 표 정의: 줄마다 (글, 가로칸수, 세로칸수), None = 위 칸과 세로 병합된 자리
TABLES = [
  ('인적사항', 6, [
    [('인적사항', 1, 5), ('성명', 1, 1), ('한글', 1, 1), ('', 1, 1), ('영문', 1, 1), ('', 1, 1)],
    [None, ('생년월일', 1, 1), ('', 2, 1), ('성별', 1, 1), ('', 1, 1)],
    [None, ('연락처', 1, 1), ('', 2, 1), ('이메일', 1, 1), ('', 1, 1)],
    [None, ('주소', 1, 1), ('', 4, 1)],
    [None, ('비상연락처', 1, 1), ('', 2, 1), ('병역', 1, 1), ('', 1, 1)],
  ]),
  ('학력사항', 5, [
    [('기간', 1, 1), ('학교명', 1, 1), ('전공', 1, 1), ('졸업여부', 1, 1), ('학점', 1, 1)],
    [('', 1, 1)] * 5, [('', 1, 1)] * 5, [('', 1, 1)] * 5,
  ]),
  ('자격사항', 4, [
    [('자격증명', 1, 1), ('등급', 1, 1), ('발급기관', 1, 1), ('취득일', 1, 1)],
    [('', 1, 1)] * 4, [('', 1, 1)] * 4, [('', 1, 1)] * 4,
  ]),
  ('경력사항', 5, [
    [('근무기간', 1, 1), ('회사명', 1, 1), ('부서', 1, 1), ('직위', 1, 1), ('담당업무', 1, 1)],
    [('', 1, 1)] * 5, [('', 1, 1)] * 5,
  ]),
  ('가족사항', 4, [
    [('관계', 1, 1), ('성명', 1, 1), ('연령', 1, 1), ('직업', 1, 1)],
    [('', 1, 1)] * 4, [('', 1, 1)] * 4, [('', 1, 1)] * 4,
  ]),
]

def layout(rows):
    """줄마다 (논리 열 위치, 칸) 목록. None은 세로 병합 자리(폭 1)."""
    out = []
    for row in rows:
        col, cells = 0, []
        for c in row:
            cells.append((col, c)); col += 1 if c is None else c[1]
        out.append(cells)
    return out

def write_zip(path, files, stored_first=None):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        if stored_first:
            z.writestr(zipfile.ZipInfo(stored_first[0]), stored_first[1], compress_type=zipfile.ZIP_STORED)
        for n, d in files.items(): z.writestr(n, d)

# ---------- docx ----------
def docx(tables=None, fname='resume.docx'):
    tables = tables or TABLES
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    body = []
    for title, ncol, rows in tables:
        body.append(f'<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>{esc(title)}</w:t></w:r></w:p>')
        t = ['<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + ''.join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>' for b in ['top','left','bottom','right','insideH','insideV']) + '</w:tblBorders></w:tblPr><w:tblGrid>' + '<w:gridCol w:w="1500"/>' * ncol + '</w:tblGrid>']
        for row in rows:
            t.append('<w:tr>')
            for c in row:
                if c is None:
                    t.append('<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>'); continue
                text, cs, rs = c
                pr = (f'<w:gridSpan w:val="{cs}"/>' if cs > 1 else '') + ('<w:vMerge w:val="restart"/>' if rs > 1 else '')
                run = f'<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>{esc(text)}</w:t></w:r>' if text else ''
                t.append(f'<w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/>{pr}</w:tcPr><w:p><w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>{run}</w:p></w:tc>')
            t.append('</w:tr>')
        t.append('</w:tbl>')
        body.append(''.join(t))
    body.append('<w:p><w:r><w:t xml:space="preserve">위 기재 사항은 사실과 틀림이 없습니다.          지원자 :                 (서명)</w:t></w:r></w:p>')
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="{W}"><w:body>{"".join(body)}<w:sectPr/></w:body></w:document>'
    files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': doc,
    }
    write_zip(os.path.join(HERE, fname), files)

# ---------- pptx ----------
def pptx():
    A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
    R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    def tc(text, extra=''):
        r = f'<a:r><a:rPr lang="ko-KR" sz="1000"/><a:t>{esc(text)}</a:t></a:r>' if text else ''
        return f'<a:tc{extra}><a:txBody><a:bodyPr/><a:lstStyle/><a:p>{r}<a:endParaRPr lang="ko-KR" sz="1000"/></a:p></a:txBody><a:tcPr/></a:tc>'
    frames, y, nid = [], 300000, 2
    for title, ncol, rows in TABLES:
        nid += 1
        frames.append(f'<p:sp><p:nvSpPr><p:cNvPr id="{nid}" name="제목 {nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="300000" y="{y}"/><a:ext cx="3000000" cy="250000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR" sz="1200" b="1"/><a:t>{esc(title)}</a:t></a:r></a:p></p:txBody></p:sp>')
        y += 260000
        trs = []
        for row in rows:
            cells = []
            for c in row:
                if c is None: cells.append(tc('', ' vMerge="1"')); continue
                text, cs, rs = c
                extra = (f' gridSpan="{cs}"' if cs > 1 else '') + (f' rowSpan="{rs}"' if rs > 1 else '')
                cells.append(tc(text, extra))
                cells += [tc('', ' hMerge="1"')] * (cs - 1)
            trs.append('<a:tr h="220000">' + ''.join(cells) + '</a:tr>')
        nid += 1
        frames.append(f'<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="{nid}" name="표 {nid}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="300000" y="{y}"/><a:ext cx="{1400000*ncol}" cy="{220000*len(rows)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>' + f'<a:gridCol w="1400000"/>' * ncol + '</a:tblGrid>' + ''.join(trs) + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>')
        y += 220000 * len(rows) + 200000
    slide = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="{A}" xmlns:r="{R}" xmlns:p="{P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>{"".join(frames)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    theme = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:theme xmlns:a="{A}" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
    sptree = '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'
    master = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldMaster xmlns:a="{A}" xmlns:r="{R}" xmlns:p="{P}">{sptree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
    layout_ = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldLayout xmlns:a="{A}" xmlns:r="{R}" xmlns:p="{P}" type="blank">{sptree}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    pres = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation xmlns:a="{A}" xmlns:r="{R}" xmlns:p="{P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    rel = lambda items: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{t}" Target="{g}"/>' for i, t, g in items) + '</Relationships>'
    ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'
    files = {
      '[Content_Types].xml': ct,
      '_rels/.rels': rel([('rId1', 'officeDocument', 'ppt/presentation.xml')]),
      'ppt/presentation.xml': pres,
      'ppt/_rels/presentation.xml.rels': rel([('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'), ('rId2', 'slide', 'slides/slide1.xml'), ('rId3', 'theme', 'theme/theme1.xml')]),
      'ppt/slides/slide1.xml': slide,
      'ppt/slides/_rels/slide1.xml.rels': rel([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')]),
      'ppt/slideLayouts/slideLayout1.xml': layout_,
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rel([('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')]),
      'ppt/slideMasters/slideMaster1.xml': master,
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': rel([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'), ('rId2', 'theme', '../theme/theme1.xml')]),
      'ppt/theme/theme1.xml': theme,
    }
    write_zip(os.path.join(HERE, 'resume.pptx'), files)

# ---------- hwpx ----------
def hwpx():
    HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
    HS = 'http://www.hancom.co.kr/hwpml/2011/section'
    LS = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="7000" flags="393216"/></hp:linesegarray>'
    def para(text, char='0'):
        run = f'<hp:run charPrIDRef="{char}"><hp:t>{esc(text)}</hp:t></hp:run>' if text else f'<hp:run charPrIDRef="{char}"/>'
        return f'<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{run}{LS}</hp:p>'
    ps = []
    for ti, (title, ncol, rows) in enumerate(TABLES):
        ps.append(para(title, '1'))
        trs = []
        for r, cells in enumerate(layout(rows)):
            tcs = []
            for col, c in cells:
                if c is None: continue
                text, cs, rs = c
                tcs.append(f'<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{para(text)}</hp:subList><hp:cellAddr colAddr="{col}" rowAddr="{r}"/><hp:cellSpan colSpan="{cs}" rowSpan="{rs}"/><hp:cellSz width="{7000*cs}" height="{1500*rs}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>')
            trs.append('<hp:tr>' + ''.join(tcs) + '</hp:tr>')
        tbl = f'<hp:tbl id="{100+ti}" zOrder="{ti}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="{len(rows)}" colCnt="{ncol}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="{7000*ncol}" widthRelTo="ABSOLUTE" height="{1500*len(rows)}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' + ''.join(trs) + '</hp:tbl>'
        ps.append(f'<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">{tbl}<hp:t/></hp:run>{LS}</hp:p>')
    section = f'<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec xmlns:hp="{HP}" xmlns:hs="{HS}">{"".join(ps)}</hs:sec>'
    header = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/></hh:head>'
    hpf = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id=""><opf:metadata/><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'
    container = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'
    version = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>'
    files = {'version.xml': version, 'META-INF/container.xml': container, 'Contents/content.hpf': hpf, 'Contents/header.xml': header, 'Contents/section0.xml': section}
    write_zip(os.path.join(HERE, 'resume.hwpx'), files, stored_first=('mimetype', 'application/hwp+zip'))

def shapes():
    """흔한 변형 구조 시험용: (인)이 같은 칸, '20 . . .' 날짜, 문단 여러 개인 칸,
    세로형 '학교명 | __' 학력, 칸 안에 표(자격사항)."""
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    def para(text):
        run = f'<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">{esc(text)}</w:t></w:r>' if text else '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>'
        return f'<w:p><w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>{run}</w:p>'
    def tc(content, span=1):
        pr = f'<w:gridSpan w:val="{span}"/>' if span > 1 else ''
        return f'<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/>{pr}</w:tcPr>{content}</w:tc>'
    def tbl(ncol, rows):
        return ('<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
                ''.join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>' for b in ['top','left','bottom','right','insideH','insideV']) +
                f'</w:tblBorders></w:tblPr><w:tblGrid>' + '<w:gridCol w:w="1600"/>' * ncol + '</w:tblGrid>' +
                ''.join('<w:tr>' + ''.join(r) + '</w:tr>' for r in rows) + '</w:tbl>')
    def title(text):
        return f'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{esc(text)}</w:t></w:r></w:p>'

    # 1) 인적사항: 성명 칸에 '(인)'이 함께, 생년월일 칸은 '20 . . .', 연락처 칸은 문단 두 개
    personal = [
        [tc(para('성명')), tc(para('(인)')), tc(para('생년월일')), tc(para('20 . . .'))],
        [tc(para('연락처')), tc(para('____') + para('')), tc(para('이메일')), tc(para('________'))],
        [tc(para('주소')), tc(para('____'), span=3)],
    ]
    # 2) 세로형 학력: '학교명 | __'이 한 줄씩, 두 항목분 반복
    edu = [[tc(para('학력사항'), span=2)]]
    for lab in ['학교명', '전공', '기간', '학교명', '전공', '기간']:
        edu.append([tc(para(lab)), tc(para('________'))])
    # 3) 칸 안에 표: 바깥 한 칸 안에 자격사항 표
    inner = tbl(4, [
        [tc(para('자격증명')), tc(para('등급')), tc(para('발급기관')), tc(para('취득일'))],
        [tc(para('________')) for _ in range(4)],
        [tc(para('________')) for _ in range(4)],
    ])
    outer = [[tc(para('자격사항'))], [tc(inner)]]

    body = title('입사지원서') + tbl(4, personal) + tbl(2, edu) + tbl(1, outer)
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="{W}"><w:body>{body}<w:sectPr/></w:body></w:document>'
    files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': doc,
    }
    write_zip(os.path.join(HERE, 'shapes.docx'), files)

def variants():
    # 자격증 이름을 양식에 미리 적어 둔 경우: 내 정보에 없는 이름 / 줄임말 / 빈 줄
    named = [t if t[0] != '자격사항' else ('자격사항', 4, [t[2][0], [('정보처리기사',1,1)] + [('',1,1)]*3, [('컴활 1급',1,1)] + [('',1,1)]*3, [('',1,1)]*4]) for t in TABLES]
    docx(named, 'resume_named.docx')
    # 자격증 칸이 1줄뿐인 경우: 넣지 못한 자격증 안내
    short = [t if t[0] != '자격사항' else ('자격사항', 4, [t[2][0], [('',1,1)]*4]) for t in TABLES]
    docx(short, 'resume_short.docx')
    # 사진 칸이 있는 경우: 맨 앞 세로 칸이 '사진 3*4'
    photo = [TABLES[0][:2] + ([[('사진 3*4', 1, 5)] + TABLES[0][2][0][1:]] + TABLES[0][2][1:],)] + TABLES[1:]
    docx(photo, 'resume_photo.docx')
    # 칸 알려 주기 시연: 자동으로 모르는 '출신국가' 칸
    teach = [TABLES[0][:2] + (TABLES[0][2][:4] + [[None, ('출신국가', 1, 1), ('', 2, 1), ('병역', 1, 1), ('', 1, 1)]],)] + TABLES[1:]
    docx(teach, 'resume_teach.docx')
    # 줄글형 양식(표 없음): '칸 이름 : ____'
    prose(['입 사 지 원 서', '성 명 : ______________     생년월일 : ______________', '주   소 : ________________________________', '연락처 :              이메일 :              ', '학교명 : ______________', '위 기재 사항은 사실과 틀림이 없습니다.', '20   년    월    일', '지원자 :              (서명)'], 'prose.docx')

def prose(lines, fname):
    W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    body = ''.join(f'<w:p><w:r><w:t xml:space="preserve">{esc(l)}</w:t></w:r></w:p>' for l in lines)
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="{W}"><w:body>{body}<w:sectPr/></w:body></w:document>'
    files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/document.xml': doc,
    }
    write_zip(os.path.join(HERE, fname), files)

if __name__ == '__main__':
    docx(); pptx(); hwpx(); variants(); shapes()
    print('resume.docx, resume.pptx, resume.hwpx, shapes.docx 생성')
