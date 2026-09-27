/**
 * まだ中身を作っていない画面の器（P4 以降で置き換える）。見出しだけを出す。
 * 見出しはハザードティック付き（wwyd-ui-concept のシグネチャー 3）。
 */
export function ScreenStub(props: { title: string }): JSX.Element {
  return (
    <section className="screen">
      <h1 className="sec-h">
        {props.title}
      </h1>
    </section>
  );
}
