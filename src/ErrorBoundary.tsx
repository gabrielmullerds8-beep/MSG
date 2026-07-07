import { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro inesperado no app", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error">
        <div>
          <img src="/brand/msg-mark.png" alt="MSG Mineração Serra Geral" />
          <h1>Algo impediu a abertura desta tela.</h1>
          <p>Atualize a página. Se continuar, verifique a conexão com o Supabase e tente novamente.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar app
          </button>
        </div>
      </main>
    );
  }
}
