import { useCallback, useEffect, useState } from "react";
import { groupNominees } from "./awardsLogic";
import {
  fetchContent,
  fetchEdition,
  fetchIsAwardsAdmin,
  fetchMyVotes,
  fetchResults,
  subscribeAwards,
} from "./awardsService";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/useAdmin";
import type { AwardsCategory, AwardsEdition, AwardsNominee, AwardsResults, MyVotes } from "./awardsTypes";

export interface AwardsData {
  loading: boolean;
  error: string | null;
  edition: AwardsEdition | null;
  categories: AwardsCategory[];
  nominees: AwardsNominee[];
  byCategory: Record<string, AwardsNominee[]>;
  myVotes: MyVotes;
  results: AwardsResults;
  /** Admin deste awards (admin do app ou da lista da edição). Só esconde/mostra UI. */
  isAdmin: boolean;
  reload: () => Promise<void>;
}

/**
 * Carrega a edição mais recente visível + categorias, indicados, o papel do usuário, os votos dele e,
 * para admins do awards numa edição encerrada, o resultado.
 * Atualiza sozinho quando algo muda (realtime).
 */
export function useAwardsData(): AwardsData {
  const { isAdmin: isAppAdmin } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edition, setEdition] = useState<AwardsEdition | null>(null);
  const [categories, setCategories] = useState<AwardsCategory[]>([]);
  const [nominees, setNominees] = useState<AwardsNominee[]>([]);
  const [myVotes, setMyVotes] = useState<MyVotes>({});
  const [results, setResults] = useState<AwardsResults>({});
  const [isListAdmin, setListAdmin] = useState(false);

  const reload = useCallback(async () => {
    const ed = await fetchEdition();
    setEdition(ed);
    if (!ed) {
      setCategories([]);
      setNominees([]);
      setListAdmin(false);
      setLoading(false);
      return;
    }
    const [content, votes, listAdmin] = await Promise.all([
      fetchContent(ed.slug),
      ed.phase === "voting" ? fetchMyVotes(ed.slug) : Promise.resolve({}),
      fetchIsAwardsAdmin(ed.slug),
    ]);
    setError(content.error);
    setCategories(content.data.categories);
    setNominees(content.data.nominees);
    setMyVotes(votes);
    setListAdmin(listAdmin);
    const seesResults = ed.phase === "closed" && (isAppAdmin || listAdmin);
    setResults(seesResults ? (await fetchResults(ed.slug)).data : {});
    setLoading(false);
  }, [isAppAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial assíncrona
    void reload();
    const channel = subscribeAwards(() => void reload());
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return {
    loading,
    error,
    edition,
    categories,
    nominees,
    byCategory: groupNominees(nominees),
    myVotes,
    results,
    isAdmin: isAppAdmin || isListAdmin,
    reload,
  };
}
