import { childcareScoreMaxPoints, zeroPointWaitingChildrenRate } from "@/lib/childcareScore";

/** 子育てのしやすさの総合の評価が machimiru の独自の評価であることと、計算方法の説明。トップページと区市町村のページで同じものを出す。 */
export function ChildcareScoreMethod() {
  return (
    <>
      <p className="childcare-score-notice">
        この評価は、公開データから machimiru が独自に作ったもので、自治体の発信ではありません。
      </p>
      <details className="childcare-score-method">
        <summary>評価の計算方法</summary>
        <p>次の根拠の指標の点数を足し、四捨五入した 100 点満点の点数です。</p>
        <ul>
          <li>
            保育所等の待機児童の割合 ({childcareScoreMaxPoints.nurseryAvailability} 点): 待機児童数 ÷ 申込者数が 0% で満点、
            {zeroPointWaitingChildrenRate * 100}% 以上で 0 点、その間は割合に比例します
          </li>
          <li>
            子ども医療費の自己負担 ({childcareScoreMaxPoints.medicalCopayment} 点): 通院・入院のどちらにも一部自己負担が無ければ満点です
          </li>
          <li>
            子ども医療費の所得制限 ({childcareScoreMaxPoints.medicalIncomeLimit} 点): 通院・入院のどちらにも所得制限が無ければ満点です
          </li>
          <li>
            子育て支援制度の件数 ({childcareScoreMaxPoints.programs} 点): 子育て支援制度レジストリに載っている制度の件数を、東京都の区市町村で最も多い件数に対する比で点数にします。件数はレジストリへの登録の細かさにも左右されます
          </li>
        </ul>
        <p>
          根拠の指標にデータが無い区市町村は「評価なし」にします。保育サービスの利用率は使える出典が無いため、子ども医療費の対象年齢は東京都の区市町村で差が無いため、評価に使っていません。
        </p>
      </details>
    </>
  );
}
