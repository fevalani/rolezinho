/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { fetchSheetById, updateSheet } from "./rpgService";
import type {
  RpgSheet,
  AbilityKey,
  AttackEntry,
  FeatureEntry,
  EquipmentEntry,
} from "./rpgTypes";
import {
  ABILITY_LABELS,
  SKILLS_BY_ABILITY,
  formatModifier,
  getModifier,
  ALIGNMENTS,
  BACKGROUNDS,
  RACES,
  CLASSES,
  DAMAGE_TYPES,
} from "./rpgTypes";

type SheetTab = "principal" | "combate" | "magias" | "inventario" | "tracos";

interface Props {
  sheetId: string;
  onBack: () => void;
  readonly?: boolean;
}

export function RpgSheetView({ sheetId, onBack, readonly = false }: Props) {
  const { user } = useAuth();
  const [sheet, setSheet] = useState<RpgSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SheetTab>("principal");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isOwner = sheet?.user_id === user?.id;
  const canEdit = isOwner && !readonly;

  const load = useCallback(async () => {
    const s = await fetchSheetById(sheetId);
    setSheet(s);
    setLoading(false);
  }, [sheetId]);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(
    (updates: Partial<RpgSheet>) => {
      if (!canEdit) return;
      setSheet((prev) => (prev ? { ...prev, ...updates } : prev));
      setDirty(true);
    },
    [canEdit],
  );

  const save = async () => {
    if (!sheet || !canEdit) return;
    setSaving(true);
    await updateSheet(sheet.id, sheet);
    setSaving(false);
    setDirty(false);
  };

  if (loading || !sheet) {
    return (
      <div className="flex items-center justify-center min-h-[60dvh]">
        <div className="spinner" />
      </div>
    );
  }

  const profBonus = sheet.proficiency_bonus;

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 56px)" }}>
      {/* Sheet Header */}
      <div className="bg-[var(--bg-card)] border-b border-[rgba(201,165,90,0.08)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-(--text-muted) p-1 -ml-1 text-xl"
          >
            ‹
          </button>
          <div className="flex-1 min-w-0">
            <EditableText
              value={sheet.character_name}
              onChange={(v) => update({ character_name: v })}
              canEdit={canEdit}
              className="font-bold text-base text-(--gold) truncate block"
              style={{ fontFamily: "var(--font-display)" }}
              placeholder="Nome do Personagem"
            />
            <div className="flex items-center gap-1.5 text-xs text-(--text-muted) flex-wrap">
              <span>{sheet.race || "Raça"}</span>
              {sheet.class_name && (
                <>
                  <span>·</span>
                  <span>{sheet.class_name}</span>
                </>
              )}
              <span>·</span>
              <span>Nível {sheet.level}</span>
              {sheet.subclass && (
                <>
                  <span>·</span>
                  <span>{sheet.subclass}</span>
                </>
              )}
            </div>
          </div>
          {canEdit && dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[rgba(201,165,90,0.15)] text-(--gold) hover:bg-[rgba(201,165,90,0.25)] disabled:opacity-50"
            >
              {saving ? "..." : "Salvar"}
            </button>
          )}
        </div>

        {/* HP Bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, (sheet.current_hp / Math.max(1, sheet.max_hp)) * 100))}%`,
                background:
                  sheet.current_hp / sheet.max_hp > 0.6
                    ? "var(--green)"
                    : sheet.current_hp / sheet.max_hp > 0.3
                      ? "#e8a020"
                      : "var(--red)",
              }}
            />
          </div>
          <span className="text-xs font-mono text-(--text-muted) flex-shrink-0">
            {sheet.current_hp}/{sheet.max_hp} HP
          </span>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex overflow-x-auto scrollbar-none bg-[var(--bg-card)] border-b border-[rgba(201,165,90,0.06)]">
        {(
          [
            "principal",
            "combate",
            "magias",
            "inventario",
            "tracos",
          ] as SheetTab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              tab === t
                ? "text-(--gold) border-b-2 border-(--gold)"
                : "text-(--text-muted)"
            }`}
          >
            {t === "principal"
              ? "Principal"
              : t === "combate"
                ? "Combate"
                : t === "magias"
                  ? "Magia"
                  : t === "inventario"
                    ? "Inventário"
                    : "Traços"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-4">
        {tab === "principal" && (
          <PrincipalTab
            sheet={sheet}
            canEdit={canEdit}
            update={update}
            profBonus={profBonus}
          />
        )}
        {tab === "combate" && (
          <CombateTab
            sheet={sheet}
            canEdit={canEdit}
            update={update}
            profBonus={profBonus}
          />
        )}
        {tab === "magias" && (
          <MagiasTab sheet={sheet} canEdit={canEdit} update={update} />
        )}
        {tab === "inventario" && (
          <InventarioTab sheet={sheet} canEdit={canEdit} update={update} />
        )}
        {tab === "tracos" && (
          <TracosTab sheet={sheet} canEdit={canEdit} update={update} />
        )}
      </div>
    </div>
  );
}

// ─── Standalone page wrapper ─────────────────────────────────

export function RpgSheetPage() {
  const navigate = useNavigate();
  const { sheetId } = useParams<{ sheetId: string }>();

  if (!sheetId || sheetId === "null") {
    // ID inválido — volta pra home
    navigate("/rpg", { replace: true });
    return null;
  }

  return <RpgSheetView sheetId={sheetId} onBack={() => navigate("/rpg")} />;
}

// ═══════════════════════════════════════════
// TAB: Principal
// ═══════════════════════════════════════════

function PrincipalTab({
  sheet,
  canEdit,
  update,
  profBonus,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
  profBonus: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Identity row */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Raça">
          <SelectOrText
            value={sheet.race}
            options={RACES}
            onChange={(v) => update({ race: v })}
            canEdit={canEdit}
            placeholder="Raça"
          />
        </Field>
        <Field label="Classe">
          <SelectOrText
            value={sheet.class_name}
            options={CLASSES}
            onChange={(v) => update({ class_name: v })}
            canEdit={canEdit}
            placeholder="Classe"
          />
        </Field>
        <Field label="Subclasse">
          <EditableText
            value={sheet.subclass}
            onChange={(v) => update({ subclass: v })}
            canEdit={canEdit}
            placeholder="Subclasse"
          />
        </Field>
        <Field label="Antecedente">
          <SelectOrText
            value={sheet.background}
            options={BACKGROUNDS}
            onChange={(v) => update({ background: v })}
            canEdit={canEdit}
            placeholder="Antecedente"
          />
        </Field>
        <Field label="Alinhamento">
          <SelectOrText
            value={sheet.alignment}
            options={ALIGNMENTS}
            onChange={(v) => update({ alignment: v })}
            canEdit={canEdit}
            placeholder="Alinhamento"
          />
        </Field>
        <Field label="Nível">
          <EditableNumber
            value={sheet.level}
            onChange={(v) => update({ level: Math.max(1, Math.min(20, v)) })}
            canEdit={canEdit}
            min={1}
            max={20}
          />
        </Field>
      </div>

      {/* Ability Scores */}
      <div>
        <SectionTitle>Atributos</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ABILITY_LABELS) as AbilityKey[]).map((key) => (
            <AbilityBlock
              key={key}
              abilityKey={key}
              value={sheet[key]}
              canEdit={canEdit}
              onChange={(v) => update({ [key]: v } as Partial<RpgSheet>)}
              sheet={sheet}
              profBonus={profBonus}
            />
          ))}
        </div>
      </div>

      {/* Saving Throws */}
      <div>
        <SectionTitle>Salvaguardas</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(ABILITY_LABELS) as AbilityKey[]).map((key) => {
            const isProficient = sheet.saving_throws[key];
            const mod =
              getModifier(sheet[key]) + (isProficient ? profBonus : 0);
            return (
              <div
                key={key}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[rgba(255,255,255,0.04)]"
              >
                {canEdit ? (
                  <button
                    onClick={() =>
                      update({
                        saving_throws: {
                          ...sheet.saving_throws,
                          [key]: !isProficient,
                        },
                      })
                    }
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${
                      isProficient
                        ? "bg-(--gold) border-(--gold)"
                        : "border-(--text-muted)"
                    }`}
                  />
                ) : (
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${isProficient ? "bg-(--gold) border-(--gold)" : "border-(--text-muted)"}`}
                  />
                )}
                <span className="text-xs text-(--text-secondary) flex-1">
                  {ABILITY_LABELS[key].short}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${mod >= 0 ? "text-(--green)" : "text-(--red)"}`}
                >
                  {formatModifier(sheet[key])}
                  {isProficient ? `+${profBonus}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills */}
      <div>
        <SectionTitle>Perícias</SectionTitle>
        <div className="flex flex-col gap-1">
          {(Object.entries(SKILLS_BY_ABILITY) as [AbilityKey, string[]][]).map(
            ([ability, skills]) =>
              skills.map((skill) => {
                const isProficient = sheet.skill_proficiencies[skill] ?? false;
                const isExpert = sheet.skill_expertise[skill] ?? false;
                const base = getModifier(sheet[ability]);
                const bonus = isExpert
                  ? profBonus * 2
                  : isProficient
                    ? profBonus
                    : 0;
                const total = base + bonus;
                return (
                  <div
                    key={skill}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    {canEdit ? (
                      <button
                        onClick={() => {
                          if (!isProficient) {
                            update({
                              skill_proficiencies: {
                                ...sheet.skill_proficiencies,
                                [skill]: true,
                              },
                              skill_expertise: {
                                ...sheet.skill_expertise,
                                [skill]: false,
                              },
                            });
                          } else if (!isExpert) {
                            update({
                              skill_expertise: {
                                ...sheet.skill_expertise,
                                [skill]: true,
                              },
                            });
                          } else {
                            update({
                              skill_proficiencies: {
                                ...sheet.skill_proficiencies,
                                [skill]: false,
                              },
                              skill_expertise: {
                                ...sheet.skill_expertise,
                                [skill]: false,
                              },
                            });
                          }
                        }}
                        className={`w-3.5 h-3.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors text-[0.5rem] ${
                          isExpert
                            ? "bg-(--gold-bright) border-(--gold-bright) text-black"
                            : isProficient
                              ? "bg-(--gold) border-(--gold)"
                              : "border-(--text-muted)"
                        }`}
                      >
                        {isExpert ? "★" : isProficient ? "" : ""}
                      </button>
                    ) : (
                      <div
                        className={`w-3.5 h-3.5 rounded flex-shrink-0 border-2 ${isExpert ? "bg-(--gold-bright) border-(--gold-bright)" : isProficient ? "bg-(--gold) border-(--gold)" : "border-(--text-muted)"}`}
                      />
                    )}
                    <span className="text-xs text-(--text-secondary) flex-1">
                      {skill}
                    </span>
                    <span className="text-[0.65rem] text-(--text-muted)">
                      {ABILITY_LABELS[ability].short}
                    </span>
                    <span
                      className={`text-xs font-bold font-mono w-8 text-right ${total >= 0 ? "text-(--text-primary)" : "text-(--red)"}`}
                    >
                      {total >= 0 ? `+${total}` : total}
                    </span>
                  </div>
                );
              }),
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Combate
// ═══════════════════════════════════════════

function CombateTab({
  sheet,
  canEdit,
  update,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
  profBonus: number;
}) {
  const [showAddAttack, setShowAddAttack] = useState(false);
  const [newAttack, setNewAttack] = useState<AttackEntry>({
    name: "",
    bonus: "",
    damage: "",
    damage_type: "",
    range: "",
    notes: "",
  });

  const addAttack = () => {
    if (!newAttack.name.trim()) return;
    update({ attacks: [...sheet.attacks, newAttack] });
    setNewAttack({
      name: "",
      bonus: "",
      damage: "",
      damage_type: "",
      range: "",
      notes: "",
    });
    setShowAddAttack(false);
  };

  const removeAttack = (i: number) => {
    update({ attacks: sheet.attacks.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Combat Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox
          label="CA"
          value={sheet.armor_class}
          onChange={(v) => update({ armor_class: v })}
          canEdit={canEdit}
        />
        <StatBox
          label="Iniciativa"
          value={
            sheet.initiative === 0
              ? getModifier(sheet.dexterity)
              : sheet.initiative
          }
          onChange={(v) => update({ initiative: v })}
          canEdit={canEdit}
        />
        <StatBox
          label="Velocidade"
          value={sheet.speed}
          onChange={(v) => update({ speed: v })}
          canEdit={canEdit}
          suffix="m"
        />
      </div>

      {/* HP */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] p-3">
        <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-3">
          Pontos de Vida
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <EditableNumber
              value={sheet.max_hp}
              onChange={(v) => update({ max_hp: v })}
              canEdit={canEdit}
              className="text-xl font-bold text-(--text-primary) font-mono w-full text-center"
            />
            <p className="text-[0.6rem] text-(--text-muted) mt-0.5">Máx HP</p>
          </div>
          <div className="text-center">
            <EditableNumber
              value={sheet.current_hp}
              onChange={(v) =>
                update({ current_hp: Math.max(0, Math.min(v, sheet.max_hp)) })
              }
              canEdit={canEdit}
              className={`text-xl font-bold font-mono w-full text-center ${
                sheet.current_hp / sheet.max_hp > 0.6
                  ? "text-(--green)"
                  : sheet.current_hp / sheet.max_hp > 0.3
                    ? "text-[#e8a020]"
                    : "text-(--red)"
              }`}
            />
            <p className="text-[0.6rem] text-(--text-muted) mt-0.5">HP Atual</p>
          </div>
          <div className="text-center">
            <EditableNumber
              value={sheet.temp_hp}
              onChange={(v) => update({ temp_hp: Math.max(0, v) })}
              canEdit={canEdit}
              className="text-xl font-bold text-(--blue) font-mono w-full text-center"
            />
            <p className="text-[0.6rem] text-(--text-muted) mt-0.5">HP Temp</p>
          </div>
        </div>

        {/* HP quick adjust */}
        {canEdit && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() =>
                update({ current_hp: Math.max(0, sheet.current_hp - 1) })
              }
              className="flex-1 py-2 rounded-lg text-(--red) bg-[rgba(196,64,64,0.1)] border border-[rgba(196,64,64,0.2)] font-bold text-lg hover:bg-[rgba(196,64,64,0.2)] transition-colors"
            >
              −
            </button>
            <button
              onClick={() =>
                update({
                  current_hp: Math.min(sheet.max_hp, sheet.current_hp + 1),
                })
              }
              className="flex-1 py-2 rounded-lg text-(--green) bg-[rgba(58,186,122,0.1)] border border-[rgba(58,186,122,0.2)] font-bold text-lg hover:bg-[rgba(58,186,122,0.2)] transition-colors"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Hit Dice */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] p-3">
        <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-2">
          Dados de Vida
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <EditableText
              value={sheet.hit_dice}
              onChange={(v) => update({ hit_dice: v })}
              canEdit={canEdit}
              placeholder="1d8"
            />
            <p className="text-[0.6rem] text-(--text-muted)">Tipo</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-(--text-primary)">
                {sheet.level - sheet.hit_dice_used}
              </p>
              <p className="text-[0.6rem] text-(--text-muted)">Disponíveis</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-(--text-muted)">
                {sheet.hit_dice_used}
              </p>
              <p className="text-[0.6rem] text-(--text-muted)">Usados</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() =>
                  update({
                    hit_dice_used: Math.min(
                      sheet.level,
                      sheet.hit_dice_used + 1,
                    ),
                  })
                }
                className="text-xs px-2 py-1 rounded bg-[rgba(196,64,64,0.1)] text-(--red)"
              >
                Usar
              </button>
              <button
                onClick={() =>
                  update({
                    hit_dice_used: Math.max(0, sheet.hit_dice_used - 1),
                  })
                }
                className="text-xs px-2 py-1 rounded bg-[rgba(58,186,122,0.1)] text-(--green)"
              >
                Rec.
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Attacks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>Ataques</SectionTitle>
          {canEdit && (
            <button
              onClick={() => setShowAddAttack(true)}
              className="text-xs text-(--gold) hover:underline"
            >
              + Adicionar
            </button>
          )}
        </div>

        {sheet.attacks.length === 0 && !showAddAttack && (
          <p className="text-xs text-(--text-muted) text-center py-3">
            Nenhum ataque registrado
          </p>
        )}

        {sheet.attacks.map((atk, i) => (
          <div
            key={i}
            className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-3 mb-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm text-(--text-primary)">
                  {atk.name}
                </p>
                <div className="flex gap-3 mt-1 text-xs text-(--text-muted)">
                  <span>
                    Atq:{" "}
                    <span className="text-(--gold)">{atk.bonus || "—"}</span>
                  </span>
                  <span>
                    Dano:{" "}
                    <span className="text-(--text-secondary)">
                      {atk.damage} {atk.damage_type}
                    </span>
                  </span>
                  {atk.range && <span>Alcance: {atk.range}</span>}
                </div>
                {atk.notes && (
                  <p className="text-xs text-(--text-muted) mt-1 italic">
                    {atk.notes}
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => removeAttack(i)}
                  className="text-(--text-muted) hover:text-(--red) transition-colors text-sm p-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}

        {showAddAttack && (
          <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newAttack.name}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, name: e.target.value }))
                }
                placeholder="Nome do ataque"
                className="col-span-2 input-field"
              />
              <input
                value={newAttack.bonus}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, bonus: e.target.value }))
                }
                placeholder="Bônus (+5)"
                className="input-field"
              />
              <input
                value={newAttack.damage}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, damage: e.target.value }))
                }
                placeholder="Dano (1d8+3)"
                className="input-field"
              />
              <select
                value={newAttack.damage_type}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, damage_type: e.target.value }))
                }
                className="input-field"
              >
                <option value="">Tipo de dano</option>
                {DAMAGE_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
              <input
                value={newAttack.range}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, range: e.target.value }))
                }
                placeholder="Alcance (1,5m)"
                className="input-field"
              />
              <input
                value={newAttack.notes}
                onChange={(e) =>
                  setNewAttack((a) => ({ ...a, notes: e.target.value }))
                }
                placeholder="Notas (opcional)"
                className="col-span-2 input-field"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddAttack(false)}
                className="flex-1 py-2 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
              >
                Cancelar
              </button>
              <button
                onClick={addAttack}
                className="flex-1 py-2 text-xs font-bold text-(--gold) rounded-lg bg-[rgba(201,165,90,0.12)]"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Features */}
      <FeaturesSection sheet={sheet} canEdit={canEdit} update={update} />
    </div>
  );
}

function FeaturesSection({
  sheet,
  canEdit,
  update,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newF, setNewF] = useState<FeatureEntry>({
    name: "",
    source: "",
    description: "",
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>Habilidades & Traços</SectionTitle>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-(--gold) hover:underline"
          >
            + Adicionar
          </button>
        )}
      </div>
      {sheet.features.map((f, i) => (
        <div
          key={i}
          className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-3 mb-2"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="font-semibold text-sm text-(--gold)">{f.name}</p>
              {f.source && (
                <p className="text-xs text-(--text-muted)">{f.source}</p>
              )}
              <p className="text-xs text-(--text-secondary) mt-1 leading-relaxed">
                {f.description}
              </p>
            </div>
            {canEdit && (
              <button
                onClick={() =>
                  update({
                    features: sheet.features.filter((_, idx) => idx !== i),
                  })
                }
                className="text-(--text-muted) hover:text-(--red) text-sm p-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      {showAdd && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 flex flex-col gap-2">
          <input
            value={newF.name}
            onChange={(e) => setNewF((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome da habilidade"
            className="input-field"
          />
          <input
            value={newF.source}
            onChange={(e) => setNewF((f) => ({ ...f, source: e.target.value }))}
            placeholder="Origem (Classe, Raça...)"
            className="input-field"
          />
          <textarea
            value={newF.description}
            onChange={(e) =>
              setNewF((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Descrição"
            rows={3}
            className="input-field resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (newF.name.trim()) {
                  update({ features: [...sheet.features, newF] });
                  setNewF({ name: "", source: "", description: "" });
                  setShowAdd(false);
                }
              }}
              className="flex-1 py-2 text-xs font-bold text-(--gold) rounded-lg bg-[rgba(201,165,90,0.12)]"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Magias
// ═══════════════════════════════════════════

function MagiasTab({
  sheet,
  canEdit,
  update,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
}) {
  const [addLevel, setAddLevel] = useState<string | null>(null);
  const [newSpell, setNewSpell] = useState("");

  const spellLevels = [
    "cantrips",
    "level1",
    "level2",
    "level3",
    "level4",
    "level5",
    "level6",
    "level7",
    "level8",
    "level9",
  ];
  const levelLabels: Record<string, string> = {
    cantrips: "Truques",
    level1: "1º Nível",
    level2: "2º Nível",
    level3: "3º Nível",
    level4: "4º Nível",
    level5: "5º Nível",
    level6: "6º Nível",
    level7: "7º Nível",
    level8: "8º Nível",
    level9: "9º Nível",
  };

  const addSpell = (level: string) => {
    if (!newSpell.trim()) return;
    const updated = {
      ...sheet.spells,
      [level]: [
        ...(sheet.spells[level] || []),
        { name: newSpell.trim(), prepared: false },
      ],
    };
    update({ spells: updated });
    setNewSpell("");
    setAddLevel(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Spellcasting info */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-2.5 text-center">
          <EditableText
            value={sheet.spellcasting_ability}
            onChange={(v) => update({ spellcasting_ability: v })}
            canEdit={canEdit}
            placeholder="Atrib."
            className="text-sm font-bold text-(--gold) text-center w-full"
          />
          <p className="text-[0.6rem] text-(--text-muted) mt-0.5">Atributo</p>
        </div>
        <StatBox
          label="CD Magia"
          value={sheet.spell_save_dc}
          onChange={(v) => update({ spell_save_dc: v })}
          canEdit={canEdit}
        />
        <StatBox
          label="Atq Magia"
          value={sheet.spell_attack_bonus}
          onChange={(v) => update({ spell_attack_bonus: v })}
          canEdit={canEdit}
          prefix="+"
        />
      </div>

      {/* Spell slots */}
      <div>
        <SectionTitle>Espaços de Magia</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {spellLevels
            .filter((l) => l !== "cantrips")
            .map((level) => {
              const slot = sheet.spell_slots[level] ?? { max: 0, used: 0 };
              if (slot.max === 0 && !canEdit) return null;
              return (
                <div
                  key={level}
                  className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-2 text-center"
                >
                  <p className="text-[0.6rem] text-(--text-muted) mb-1">
                    {levelLabels[level]}
                  </p>
                  <div className="flex items-center justify-center gap-1">
                    {canEdit ? (
                      <>
                        <button
                          onClick={() =>
                            update({
                              spell_slots: {
                                ...sheet.spell_slots,
                                [level]: {
                                  ...slot,
                                  used: Math.min(slot.max, slot.used + 1),
                                },
                              },
                            })
                          }
                          className="text-xs text-(--red) w-5"
                        >
                          −
                        </button>
                        <span className="text-sm font-bold text-(--text-primary) font-mono">
                          {slot.max - slot.used}
                        </span>
                        <button
                          onClick={() =>
                            update({
                              spell_slots: {
                                ...sheet.spell_slots,
                                [level]: {
                                  ...slot,
                                  used: Math.max(0, slot.used - 1),
                                },
                              },
                            })
                          }
                          className="text-xs text-(--green) w-5"
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-(--text-primary)">
                        {slot.max - slot.used}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <button
                        onClick={() =>
                          update({
                            spell_slots: {
                              ...sheet.spell_slots,
                              [level]: {
                                ...slot,
                                max: Math.max(0, slot.max - 1),
                              },
                            },
                          })
                        }
                        className="text-[0.6rem] text-(--text-muted)"
                      >
                        −máx
                      </button>
                      <span className="text-[0.6rem] text-(--text-muted)">
                        /{slot.max}
                      </span>
                      <button
                        onClick={() =>
                          update({
                            spell_slots: {
                              ...sheet.spell_slots,
                              [level]: { ...slot, max: slot.max + 1 },
                            },
                          })
                        }
                        className="text-[0.6rem] text-(--text-muted)"
                      >
                        +máx
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Spell lists */}
      {spellLevels.map((level) => {
        const spells = sheet.spells[level] ?? [];
        if (spells.length === 0 && !canEdit) return null;
        return (
          <div key={level}>
            <div className="flex items-center justify-between mb-1">
              <SectionTitle>{levelLabels[level]}</SectionTitle>
              {canEdit && addLevel !== level && (
                <button
                  onClick={() => setAddLevel(level)}
                  className="text-xs text-(--gold) hover:underline"
                >
                  + Magia
                </button>
              )}
            </div>
            {spells.map((spell, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.02)]"
              >
                {canEdit && level !== "cantrips" && (
                  <button
                    onClick={() => {
                      const updated = {
                        ...sheet.spells,
                        [level]: spells.map((s, si) =>
                          si === i ? { ...s, prepared: !s.prepared } : s,
                        ),
                      };
                      update({ spells: updated });
                    }}
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${spell.prepared ? "bg-(--gold) border-(--gold)" : "border-(--text-muted)"}`}
                  />
                )}
                <span className="text-sm text-(--text-secondary) flex-1">
                  {spell.name}
                </span>
                {canEdit && (
                  <button
                    onClick={() => {
                      const updated = {
                        ...sheet.spells,
                        [level]: spells.filter((_, si) => si !== i),
                      };
                      update({ spells: updated });
                    }}
                    className="text-(--text-muted) hover:text-(--red) text-sm px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {addLevel === level && (
              <div className="flex gap-2 mt-1">
                <input
                  autoFocus
                  value={newSpell}
                  onChange={(e) => setNewSpell(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSpell(level)}
                  placeholder="Nome da magia"
                  className="flex-1 input-field"
                />
                <button
                  onClick={() => addSpell(level)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[rgba(201,165,90,0.12)] text-(--gold)"
                >
                  OK
                </button>
                <button
                  onClick={() => {
                    setAddLevel(null);
                    setNewSpell("");
                  }}
                  className="px-2 py-1.5 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Inventário
// ═══════════════════════════════════════════

function InventarioTab({
  sheet,
  canEdit,
  update,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<EquipmentEntry>({
    name: "",
    quantity: 1,
    weight: 0,
    equipped: false,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Currency */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] p-3">
        <p className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest mb-3">
          Moedas
        </p>
        <div className="grid grid-cols-5 gap-2">
          {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin) => {
            const labels = {
              cp: "Cobre",
              sp: "Prata",
              ep: "Electrum",
              gp: "Ouro",
              pp: "Platina",
            };
            const colors = {
              cp: "#b87333",
              sp: "#9e9e9e",
              ep: "#7bafd4",
              gp: "#e8c86e",
              pp: "#e5e4e2",
            };
            return (
              <div key={coin} className="text-center">
                <EditableNumber
                  value={sheet.currency[coin]}
                  onChange={(v) =>
                    update({
                      currency: { ...sheet.currency, [coin]: Math.max(0, v) },
                    })
                  }
                  canEdit={canEdit}
                  className="text-lg font-bold font-mono w-full text-center"
                  style={{ color: colors[coin] }}
                />
                <p className="text-[0.55rem] text-(--text-muted)">
                  {labels[coin]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>Equipamentos</SectionTitle>
          {canEdit && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-(--gold) hover:underline"
            >
              + Item
            </button>
          )}
        </div>

        {sheet.equipment.length === 0 && !showAdd && (
          <p className="text-xs text-(--text-muted) text-center py-3">
            Inventário vazio
          </p>
        )}

        {sheet.equipment.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0"
          >
            {canEdit && (
              <button
                onClick={() => {
                  const eq = sheet.equipment.map((e, ei) =>
                    ei === i ? { ...e, equipped: !e.equipped } : e,
                  );
                  update({ equipment: eq });
                }}
                className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-colors ${item.equipped ? "bg-(--gold) border-(--gold)" : "border-(--text-muted)"}`}
              />
            )}
            <span
              className={`flex-1 text-sm ${item.equipped ? "text-(--text-primary)" : "text-(--text-secondary)"}`}
            >
              {item.name}
            </span>
            <span className="text-xs text-(--text-muted)">
              ×{item.quantity}
            </span>
            {item.weight > 0 && (
              <span className="text-xs text-(--text-muted)">
                {item.weight}kg
              </span>
            )}
            {canEdit && (
              <button
                onClick={() =>
                  update({
                    equipment: sheet.equipment.filter((_, ei) => ei !== i),
                  })
                }
                className="text-(--text-muted) hover:text-(--red) text-sm px-1"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {showAdd && (
          <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] p-3 mt-2 flex flex-col gap-2">
            <input
              value={newItem.name}
              onChange={(e) =>
                setNewItem((n) => ({ ...n, name: e.target.value }))
              }
              placeholder="Nome do item"
              className="input-field"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-(--text-muted)">
                  Quantidade
                </label>
                <input
                  type="number"
                  min={1}
                  value={newItem.quantity}
                  onChange={(e) =>
                    setNewItem((n) => ({
                      ...n,
                      quantity: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-(--text-muted)">Peso (kg)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={newItem.weight}
                  onChange={(e) =>
                    setNewItem((n) => ({
                      ...n,
                      weight: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="input-field w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 text-xs text-(--text-muted) rounded-lg border border-[rgba(255,255,255,0.06)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (newItem.name.trim()) {
                    update({ equipment: [...sheet.equipment, newItem] });
                    setNewItem({
                      name: "",
                      quantity: 1,
                      weight: 0,
                      equipped: false,
                    });
                    setShowAdd(false);
                  }
                }}
                className="flex-1 py-2 text-xs font-bold text-(--gold) rounded-lg bg-[rgba(201,165,90,0.12)]"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Traços
// ═══════════════════════════════════════════

function TracosTab({
  sheet,
  canEdit,
  update,
}: {
  sheet: RpgSheet;
  canEdit: boolean;
  update: (u: Partial<RpgSheet>) => void;
}) {
  const fields: { key: keyof RpgSheet; label: string; placeholder: string }[] =
    [
      {
        key: "personality_traits",
        label: "Traços de Personalidade",
        placeholder: "Como você age? Quais são seus maneirismos?",
      },
      {
        key: "ideals",
        label: "Ideais",
        placeholder: "O que te motiva e guia suas ações?",
      },
      {
        key: "bonds",
        label: "Vínculos",
        placeholder: "O que ou quem é mais importante pra você?",
      },
      {
        key: "flaws",
        label: "Falhas",
        placeholder: "Quais são seus pontos fracos e vícios?",
      },
      {
        key: "backstory",
        label: "História",
        placeholder: "De onde você veio? O que te trouxe até aqui?",
      },
      { key: "notes", label: "Notas", placeholder: "Anotações diversas..." },
    ];

  return (
    <div className="flex flex-col gap-4">
      {fields.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="text-[0.65rem] text-(--text-muted) uppercase tracking-widest block mb-1">
            {label}
          </label>
          {canEdit ? (
            <textarea
              value={(sheet[key] as string) || ""}
              onChange={(e) =>
                update({ [key]: e.target.value } as Partial<RpgSheet>)
              }
              placeholder={placeholder}
              rows={key === "backstory" ? 5 : 3}
              className="w-full bg-[var(--bg-card)] border border-[rgba(201,165,90,0.1)] rounded-xl px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) resize-none focus:outline-none focus:border-[rgba(201,165,90,0.35)] leading-relaxed"
            />
          ) : (
            <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] px-3 py-2.5 text-sm text-(--text-secondary) leading-relaxed min-h-[60px] whitespace-pre-wrap">
              {(sheet[key] as string) || (
                <span className="text-(--text-muted) italic">
                  {placeholder}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

function AbilityBlock({
  abilityKey,
  value,
  canEdit,
  onChange,
}: {
  abilityKey: AbilityKey;
  value: number;
  canEdit: boolean;
  onChange: (v: number) => void;
  sheet: RpgSheet;
  profBonus: number;
}) {
  const mod = getModifier(value);

  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-2.5 text-center flex flex-col items-center gap-1">
      <p className="text-[0.65rem] font-bold text-(--text-muted) uppercase tracking-wider">
        {ABILITY_LABELS[abilityKey].short}
      </p>
      <div
        className="text-2xl font-bold text-(--text-primary) w-12 text-center"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {canEdit ? (
          <input
            type="number"
            value={value}
            onChange={(e) =>
              onChange(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))
            }
            className="w-full bg-transparent text-center text-2xl font-bold text-(--text-primary) focus:outline-none focus:text-(--gold) [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            min={1}
            max={30}
          />
        ) : (
          <span>{value}</span>
        )}
      </div>
      <div
        className={`text-base font-bold ${mod >= 0 ? "text-(--gold)" : "text-(--red)"}`}
      >
        {formatModifier(value)}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  onChange,
  canEdit,
  suffix,
  prefix,
  style,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  canEdit: boolean;
  suffix?: string;
  prefix?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-xl bg-[var(--bg-card)] border border-[rgba(201,165,90,0.07)] p-2.5 text-center"
      style={style}
    >
      <div className="flex items-baseline justify-center gap-0.5">
        {prefix && (
          <span className="text-sm text-(--text-muted)">{prefix}</span>
        )}
        {canEdit ? (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            className="w-12 bg-transparent text-center text-xl font-bold text-(--text-primary) focus:outline-none focus:text-(--gold) [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="text-xl font-bold text-(--text-primary)">
            {value}
          </span>
        )}
        {suffix && (
          <span className="text-xs text-(--text-muted)">{suffix}</span>
        )}
      </div>
      <p className="text-[0.6rem] text-(--text-muted) mt-0.5">{label}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[0.6rem] text-(--text-muted) uppercase tracking-wider block mb-0.5">
        {label}
      </label>
      <div className="bg-[var(--bg-card)] border border-[rgba(201,165,90,0.08)] rounded-lg px-2.5 py-1.5 text-sm text-(--text-primary) min-h-[34px] flex items-center">
        {children}
      </div>
    </div>
  );
}

function EditableText({
  value,
  onChange,
  canEdit,
  placeholder,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  canEdit: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!canEdit)
    return (
      <span className={className} style={style}>
        {value || placeholder}
      </span>
    );
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-transparent focus:outline-none ${className ?? "text-sm text-(--text-primary) w-full"}`}
      style={style}
    />
  );
}

function EditableNumber({
  value,
  onChange,
  canEdit,
  min,
  max,
  className,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  canEdit: boolean;
  min?: number;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!canEdit)
    return (
      <span
        className={className ?? "text-sm font-bold text-(--text-primary)"}
        style={style}
      >
        {value}
      </span>
    );
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (isNaN(v)) return;
        onChange(
          min !== undefined
            ? Math.max(min, max !== undefined ? Math.min(max, v) : v)
            : v,
        );
      }}
      min={min}
      max={max}
      className={`bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${className ?? "text-sm font-bold text-(--text-primary) w-16"}`}
      style={style}
    />
  );
}

function SelectOrText({
  value,
  options,
  onChange,
  canEdit,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  canEdit: boolean;
  placeholder?: string;
}) {
  if (!canEdit)
    return (
      <span className="text-sm text-(--text-primary)">
        {value || placeholder}
      </span>
    );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-sm text-(--text-primary) focus:outline-none w-full"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.65rem] font-bold text-(--text-muted) uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}
