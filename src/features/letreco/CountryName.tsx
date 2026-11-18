import { SUPOSTO_PAIS } from "./fronteirasLogic";

/** Nome do país na tela; Israel ganha o aviso em itálico. */
export function CountryName({ iso, name }: { iso: string; name: string }) {
  if (iso !== "IL") return <>{name}</>;
  return (
    <>
      {name} <i>{SUPOSTO_PAIS}</i>
    </>
  );
}
