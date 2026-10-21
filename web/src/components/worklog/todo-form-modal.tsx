"use client";

/**
 * 할 일 추가 · 수정 폼 (홈 「앞으로 할 일」, 명세: home-SPEC.md §2). 기록에서 온 할 일도 같은 폼으로 고친다.
 * 연결은 전부 코드 선택(칩)으로만 한다: 프로젝트(P-코드) · 목표(G) · 계획 항목(G-n-m). 제목 입력으로 잇지 않는다(VOCAB §2).
 * 행(체크박스 제외)을 누르면 이 폼이 열리고, 삭제는 폼 푸터의 [삭제] → 확인 모달로만 한다(2026-10-21 지시: 행 호버 아이콘 대신).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useDeleteTodo, useGoals, useProjects, useUpsertTodo } from "@/hooks/use-worklog";
import s from "./worklog.module.css";

export type TodoFormValue = {
  id: string | null; text: string; needsDecision: boolean; projectSlug: string | null; goalCode: string | null;
  planItemCode: string | null; startDate: string | null; dueDate: string | null; note: string | null; done: boolean;
};
export type PlanItemOption = { code: string; text: string; done: boolean };

export function TodoFormModal({ open, todo, planItems, onClose }: { open: boolean; todo: TodoFormValue | null; planItems: PlanItemOption[]; onClose: () => void }) {
  const t = useTranslations("wl.home");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const projects = useProjects();
  const goals = useGoals("active");
  const upsert = useUpsertTodo();
  const del = useDeleteTodo();
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const [ask, setAsk] = useState<"normal" | "ask">("normal");
  const [project, setProject] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [planItem, setPlanItem] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"open" | "done">("open");

  useEffect(() => {
    if (!open) return;
    setText(todo?.text ?? ""); setAsk(todo?.needsDecision ? "ask" : "normal");
    setProject(todo?.projectSlug ?? null); setGoal(todo?.goalCode ?? null); setPlanItem(todo?.planItemCode ?? null);
    setStart(todo?.startDate ?? ""); setDue(todo?.dueDate ?? ""); setNote(todo?.note ?? ""); setState(todo?.done ? "done" : "open");
  }, [open, todo]);

  const goalOptions = useMemo(() => (goals.data ?? []).filter((g) => !project || g.project_slug === project), [goals.data, project]);
  const itemOptions = useMemo(() => planItems.filter((p) => !goal || p.code.startsWith(goal + "-")), [planItems, goal]);

  const remove = async () => {
    if (!todo?.id) return;
    try {
      await del.mutateAsync(todo.id);
      toast({ title: tc("deleted"), variant: "success" });
      setConfirm(false);
      onClose();
    } catch {
      toast({ title: tc("deleteFailed"), variant: "destructive" });
    }
  };
  const submit = async () => {
    try {
      await upsert.mutateAsync({ id: todo?.id ?? null, text: text.trim(), needsDecision: ask === "ask", projectSlug: project, goalCode: goal, planItemCode: planItem, startDate: start || null, dueDate: due || null, note, done: state === "done" });
      toast({ title: t("todoSaved"), variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Modal
      open={open}
      title={todo ? t("editTodo") : t("addTodo")}
      onClose={onClose}
      size="lg"
      footer={<>
        {todo && <Button variant="danger" className={s.footerLeft} onClick={() => setConfirm(true)}>{tc("delete")}</Button>}
        <Button variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!text.trim() || (!!start && (!due || start > due))} loading={upsert.isPending}>{tc("save")}</Button>
      </>}
    >
      <div className={s.form}>
        <Field label={t("todoText")} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("phTodo")} />
        <div className={s.twoCol}>
          <div className={s.chipPick}>
            <span>{t("todoKind")}</span>
            <Segmented ariaLabel={t("todoKind")} size="sm" value={ask} onChange={setAsk} options={[{ value: "normal", label: t("kindNormal") }, { value: "ask", label: t("kindAsk") }]} />
          </div>
          {todo && (
            <div className={s.chipPick}>
              <span>{t("todoState")}</span>
              <Segmented ariaLabel={t("todoState")} size="sm" value={state} onChange={setState} options={[{ value: "open", label: t("stateOpen") }, { value: "done", label: t("stateDone") }]} />
            </div>
          )}
        </div>
        <div className={s.chipPick}>
          <span>{t("todoProject")}</span>
          <div className={s.chips}>
            <Chip on={project === null} size="sm" onClick={() => { setProject(null); }}>{t("none")}</Chip>
            {(projects.data ?? []).map((p) => <Chip key={p.slug} on={project === p.slug} size="sm" onClick={() => { setProject(p.slug); if (goal && !goalOptions.some((g) => g.code === goal)) setGoal(null); }}>{p.name}</Chip>)}
          </div>
        </div>
        <div className={s.chipPick}>
          <span>{t("todoGoal")}</span>
          <div className={s.chips}>
            <Chip on={goal === null} size="sm" onClick={() => { setGoal(null); setPlanItem(null); }}>{t("none")}</Chip>
            {goalOptions.map((g) => <Chip key={g.code} on={goal === g.code} size="sm" onClick={() => { setGoal(g.code); if (!project) setProject(g.project_slug); if (planItem && !planItem.startsWith(g.code + "-")) setPlanItem(null); }}><span className={s.code}>{g.code}</span> {g.title}</Chip>)}
            {goalOptions.length === 0 && <span className={s.hint}>{t("noGoalOptions")}</span>}
          </div>
        </div>
        <div className={s.chipPick}>
          <span>{t("todoPlanItem")}</span>
          <div className={s.chips}>
            <Chip on={planItem === null} size="sm" onClick={() => setPlanItem(null)}>{t("none")}</Chip>
            {itemOptions.map((p) => <Chip key={p.code} on={planItem === p.code} size="sm" onClick={() => { setPlanItem(p.code); const g = p.code.split("-")[0]; if (goal !== g) { setGoal(g); const gg = (goals.data ?? []).find((x) => x.code === g); if (gg && !project) setProject(gg.project_slug); } }}><span className={s.code}>{p.code}</span> {p.text}</Chip>)}
            {itemOptions.length === 0 && <span className={s.hint}>{t("noItemOptions")}</span>}
          </div>
        </div>
        <div className={s.twoCol}>
          <Field label={t("todoStart")} type="date" value={start} max={due || undefined} onChange={(e) => setStart(e.target.value)} hint={t("todoStartHint")} />
          <Field label={t("todoDue")} type="date" value={due} min={start || undefined} onChange={(e) => setDue(e.target.value)} />
        </div>
        <Textarea label={t("todoNote")} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        <p className={s.hint}>{t("todoFormHint")}</p>
      </div>
      <Modal
        open={confirm}
        title={t("deleteTodoTitle")}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{t("deleteTodoBody", { text: todo?.text ?? "" })}</p>
      </Modal>
    </Modal>
  );
}
