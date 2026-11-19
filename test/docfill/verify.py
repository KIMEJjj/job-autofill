# 채운 양식(test/docfill/out/*_채움.*)의 표를 읽어 기대값과 비교합니다.
# resume_채움: 기본 양식 5개 표 / shapes_채움: 변형 구조((인)·'20 . . .'·문단 여러 개·세로형 학력·칸 안 표)
import sys, zipfile, re, os
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
loc = lambda e: e.tag.split('}')[-1]
def kids(e, n): return [c for c in e if loc(c) == n]
def text(e): return ''.join((x.text or '') for x in e.iter() if loc(x) == 't')
def tables(path):
    z = zipfile.ZipFile(path); assert z.testzip() is None
    out = []
    for n in z.namelist():
        if not re.search(r'(word/document|ppt/slides/slide\d+|Contents/section\d+)\.xml$', n): continue
        root = ET.fromstring(z.read(n))
        for t in root.iter():
            if loc(t) != 'tbl': continue
            rows = []
            for tr in kids(t, 'tr'):
                cells = []
                for tc in kids(tr, 'tc'):
                    if tc.get('hMerge') == '1': continue
                    cells.append(text(tc).strip())
                rows.append(cells)
            out.append(rows)
    return out
EXP = {
  0: [['인적사항','성명','한글','홍길동','영문','HONG GILDONG'], ['생년월일','1999.03.07','성별','남'], ['연락처','010-1234-5678','이메일','testuser@gmail.com'], ['주소','서울특별시 중구 을지로 79 101동 1001호'], ['비상연락처','010-9876-5432','병역','군필']],
  1: [['기간','학교명','전공','졸업여부','학점'], ['2015.03 ~ 2018.02','테스트고등학교','','졸업',''], ['2018.03 ~ 2025.02','테스트대학교','경영학과','졸업','3.85 / 4.5'], ['','','','','']],
  2: [['자격증명','등급','발급기관','취득일'], ['컴퓨터활용능력 1급','','대한상공회의소','2023.08.11'], ['한국사능력검정시험 1급','','국사편찬위원회','2024.02.20'], ['','','','']],
  3: [['근무기간','회사명','부서','직위','담당업무'], ['2025.01.02 ~ 2025.06.30','테스트공사','경영지원팀','인턴','문서 관리 및 행정 지원'], ['','','','','']],
  4: [['관계','성명','연령','직업'], ['','','',''], ['','','',''], ['','','','']],
}
EXP_SHAPES = {
  0: [['성명','홍길동 (인)','생년월일','1999.03.07'], ['연락처','010-1234-5678','이메일','testuser@gmail.com'], ['주소','서울특별시 중구 을지로 79 101동 1001호']],
  1: [['학력사항'], ['학교명','테스트고등학교'], ['전공','________'], ['기간','2015.03 ~ 2018.02'], ['학교명','테스트대학교'], ['전공','경영학과'], ['기간','2018.03 ~ 2025.02']],
  # 표2는 칸 안에 표를 품은 바깥 표(글자가 합쳐져 보임)라 건너뛰고, 표3(안쪽 자격 표)을 비교
  3: [['자격증명','등급','발급기관','취득일'], ['컴퓨터활용능력 1급','________','대한상공회의소','2023.08.11'], ['한국사능력검정시험 1급','________','국사편찬위원회','2024.02.20']],
}
bad = 0
for f in sys.argv[1:]:
    ts = tables(f)
    base = os.path.basename(f)
    exp_all = EXP_SHAPES if 'shapes' in base else EXP
    ok = 0; tot = 0
    for i, exp in exp_all.items():
        if i >= len(ts): bad += 1; print(f'  {base} 표{i}: 표가 없습니다'); continue
        got = [[c for c in r if c != '' or True] for r in ts[i]]
        # 세로 병합 자리(빈 칸) 제거 후 비교: docx 연속 칸은 빈 글
        got = [[c for j, c in enumerate(r) if not (i == 0 and k > 0 and j == 0 and c == '')] for k, r in enumerate(ts[i])]
        for k, row in enumerate(exp):
            tot += 1
            if got[k] == row: ok += 1
            else: bad += 1; print(f'  {base} 표{i} 줄{k}: 기대 {row} / 실제 {got[k]}')
    print(f'{base}: {ok}/{tot} 줄 일치')
sys.exit(1 if bad else 0)
