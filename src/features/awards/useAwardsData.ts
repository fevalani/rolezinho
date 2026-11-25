import { useCallback, useEffect, useState } from "react";
import { groupNominees } from "./awardsLogic";
import {
  fetchContent,
  fetchEdition,
  fetchMyVotes,
  fetchResults,
  subscribeAwards,
} from "./awardsService";
import { supabase } from "@/lib/supabase";
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
  reload: () => Promise<void>;
}

/**
 * Carrega a edição mais recente visível + categorias, indicados, votos do usuário e (se encerrada) o resultado.
 * Atualiza sozinho quando alguém do grupo adiciona/apaga algo (realtime).
 */
export function useAwardsData(): AwardsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edition, setEdition] = useState<AwardsEdition | null>(null);
  const [categories, setCategories] = useState<AwardsCategory[]>([]);
  const [nominees, setNominees] = useState<AwardsNominee[]>([]);
  const [myVotes, setMyVotes] = useState<MyVotes>({});
  const [results, setResults] = useState<AwardsResults>({});

  const reload = useCallback(async () => {
    const ed = await fetchEdition();
    setEdition(ed);
    if (!ed) {
      setCategories([]);
      setNominees([]);
      setLoading(false);
      return;
    }
    const [content, votes] = await Promise.all([
      fetchContent(ed.slug),
      ed.phase === "voting" || ed.phase === "closed" ? fetchMyVotes(ed.slug) : Promise.resolve({}),
    ]);
    setError(content.error);
    setCategories(content.data.categories);
    setNominees(content.data.nominees);
    setMyVotes(votes);
    if (ed.phase === "closed") setResults((await fetchResults(ed.slug)).data);
    setLoading(false);
  }, []);

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
    reload,
  };
}
