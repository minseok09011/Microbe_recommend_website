/* 토비오가 돋보기로 조사/냄새맡기/소리듣기 같은 행동을 할 때 머리 위에 뜨는 작은 말풍선.
   CSS는 index.css의 .tobio-action-bubble / tobio-bubble-pop 공용 정의를 그대로 쓴다.
   애니메이션을 매번 새로 재생하려면 호출하는 쪽에서 JSX에 key={...}를 바꿔주면 된다. */
export default function TobioActionBubble({ emoji, style }) {
  return (
    <div className="tobio-action-bubble" style={style}>
      <span>{emoji}</span>
    </div>
  );
}
