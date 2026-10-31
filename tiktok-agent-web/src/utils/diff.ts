// 单词级（CJK 字符 / 拉丁词 / 空白 / 标点）LCS diff，用于颜色标注文案修改处
export type DiffTok = { t: 'same' | 'add' | 'del'; s: string }

function tokenize(s: string): string[] {
  const re = /[一-鿿]|[A-Za-z0-9]+|\s+|[^一-鿿A-Za-z0-9\s]/g
  return s.match(re) ?? []
}

export function diffWords(a: string, b: string): DiffTok[] {
  const aw = tokenize(a)
  const bw = tokenize(b)
  const n = aw.length
  const m = bw.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffTok[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (aw[i] === bw[j]) {
      out.push({ t: 'same', s: aw[i] }); i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: 'del', s: aw[i] }); i++
    } else {
      out.push({ t: 'add', s: bw[j] }); j++
    }
  }
  while (i < n) out.push({ t: 'del', s: aw[i++] })
  while (j < m) out.push({ t: 'add', s: bw[j++] })
  return out
}
