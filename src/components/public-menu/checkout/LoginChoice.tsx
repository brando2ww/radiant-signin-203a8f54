import { Button } from "@/components/ui/button";

interface LoginChoiceProps {
  onGuest: () => void;
  onLogin: () => void;
  onSignUp: () => void;
}

export const LoginChoice = ({ onGuest, onLogin, onSignUp }: LoginChoiceProps) => {
  return (
    <div className="space-y-4 py-2">
      <Button type="button" className="w-full" onClick={onGuest}>
        Comprar sem cadastro
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={onLogin}>
        Já sou cadastrado
      </Button>
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onSignUp}
          className="text-sm text-primary hover:underline font-medium"
        >
          Cadastre-se
        </button>
      </div>
    </div>
  );
};
