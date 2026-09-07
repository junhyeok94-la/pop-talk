"use client";

import {
  ActionButton,
  ContentPlaceholderRoot,
  FieldHeader,
  FieldLabel,
  FieldRoot,
  SwitchControl,
  SwitchHiddenInput,
  SwitchRoot,
  SwitchThumb,
  TextFieldInput,
  TextFieldRoot,
  VisuallyHidden,
} from "@seed-design/react";
import { useEffect, useState } from "react";

import { PageSub, PageTitle } from "@/components/typography";
import { ConfirmModal } from "@/components/confirm-modal";
import { DateTimeCell } from "@/components/date-time-cell";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/snackbar";
import { AdminChip } from "@/components/movie-cell";
import { Pagination } from "@/components/pagination";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { useAdminStore } from "@/lib/admin-store";
import {
  createDisplayCategory,
  deleteDisplayCategory,
  fetchCategories,
  fetchDisplayCategories,
  patchDisplayCategory,
} from "@/lib/api";
import { CURRENT_ADMIN, type Category, type MovieCategory } from "@/lib/mock";
import { IconAdd, IconEdit, IconHidden, IconText, IconTrash } from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

type CategoryForm = {
  /* 알약을 누르면 입력창에 채워져 챗봇에게 보내지는 문장. */
  name: string;
  /* 알약 버튼에 보이는 짧은 이름. 비우면 알약으로 쓰지 않는다. */
  short_label: string;
  /* 이 문구가 묶는 카테고리 코드들. 담기는 영화를 정한다(011). */
  category_codes: string[];
  description: string;
  sort_order: number;
};

const EMPTY_FORM: CategoryForm = {
  name: "",
  short_label: "",
  category_codes: [],
  description: "",
  sort_order: 1,
};

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";

const PAGE_SIZE = 10;

export default function CategoriesPage() {
  const { categories: storeCategories } = useAdminStore();
  const toast = useToast();

  /*
   * 문구와 분류 선택지를 서버에서 받는다.
   *
   * 등록·수정·삭제가 화면 상태만 바꿔 새로고침하면 되돌아갔다 —
   * admin에서 마지막까지 통째로 목이던 화면이다.
   *
   * 분류 선택지는 카테고리 관리에 등록한 값이다. 이 선택이 문구에 어떤
   * 영화가 담기는지를 정한다(마이그레이션 008).
   */
  const [categories, setCategories] = useState<Category[]>(storeCategories);
  const [movieCategories, setMovieCategories] = useState<MovieCategory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchDisplayCategories(controller.signal),
      fetchCategories(controller.signal),
    ]).then(([phrases, cats]) => {
      if (controller.signal.aborted) return;
      if (phrases) setCategories(phrases);
      // 꺼진 카테고리는 새 문구에 고를 수 없게 한다.
      if (cats) setMovieCategories(cats.filter((c) => c.is_active));
    });
    return () => controller.abort();
  }, []);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [confirmActive, setConfirmActive] = useState<Category | null>(null);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, sort_order: categories.length + 1 });
    setOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditTarget(category);
    setForm({
      name: category.name,
      short_label: category.short_label ?? "",
      category_codes: category.category_codes,
      // DB는 설명이 비면 null을 준다. 그대로 넣으면 input이 비제어로 바뀐다.
      description: category.description ?? "",
      sort_order: category.sort_order,
    });
    setOpen(true);
  };

  const isValid = form.name.trim() !== "" && form.category_codes.length > 0;

  /*
   * 저장이 끝난 뒤에 화면을 바꾼다 — 카테고리·영화 판정과 같은 이유다.
   * 서버가 돌려준 행으로 교체한다. movie_count와 분류 이름은 뷰가 세어 주는
   * 값이라 여기서 만들 수 없다.
   */
  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      // 빈 문자열을 그대로 보낸다. 서버가 null로 저장해 알약에서 내린다.
      short_label: form.short_label.trim(),
      category_codes: form.category_codes,
      description: form.description.trim(),
      sort_order: form.sort_order,
      admin: CURRENT_ADMIN.name,
    };
    const res = editTarget
      ? await patchDisplayCategory(editTarget.id, payload)
      : await createDisplayCategory(payload);
    setSaving(false);

    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) =>
      editTarget ? prev.map((c) => (c.id === editTarget.id ? res.category : c)) : [...prev, res.category],
    );
    toast(`“${res.category.name}” 문구를 저장했습니다.`, "positive");
    setOpen(false);
  };

  const handleDelete = async (id: number, name: string) => {
    const res = await deleteDisplayCategory(id);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast(`“${name}” 문구를 삭제했습니다.`, "critical");
  };

  const toggleActive = async (id: number) => {
    const current = categories.find((c) => c.id === id);
    if (!current) return;
    const res = await patchDisplayCategory(id, {
      is_active: !current.is_active,
      admin: CURRENT_ADMIN.name,
    });
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? res.category : c)));
  };

  const filtered = categories.filter((c) => {
    if (activeFilter === "ACTIVE") return c.is_active;
    if (activeFilter === "INACTIVE") return !c.is_active;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 필터가 좁혀져 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: categories.length,
      caption: "등록된 문구",
      icon: IconText,
      tone: "brand",
      active: activeFilter === "ALL",
      onClick: () => setActiveFilter("ALL"),
    },
    {
      key: "ACTIVE",
      label: "활성",
      value: categories.filter((c) => c.is_active).length,
      caption: "화면에 노출",
      icon: IconText,
      tone: "positive",
      active: activeFilter === "ACTIVE",
      onClick: () => setActiveFilter("ACTIVE"),
    },
    {
      key: "INACTIVE",
      label: "비활성",
      value: categories.filter((c) => !c.is_active).length,
      caption: "노출 제외",
      icon: IconHidden,
      tone: "neutral",
      active: activeFilter === "INACTIVE",
      onClick: () => setActiveFilter("INACTIVE"),
    },
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>화면 문구 관리</PageTitle>
          <PageSub>서비스 화면에 표시되는 카테고리 알약 문구 관리</PageSub>
        </div>
        <ActionButton type="button" variant="brandSolid" size="small" onClick={openAdd}>
          <IconAdd size={14} />
          문구 추가
        </ActionButton>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.card}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>알약</th>
              {/*
                설명은 표에서 뺐다. 열이 많아지면서 이 칸이 한 글자 너비로
                눌려 세로로 읽히게 됐다. 운영자 메모라 목록에서 훑을 값이
                아니고, 수정 창에서 그대로 볼 수 있다.
              */}
              <th className={styles.promptCol}>입력창에 채워지는 문장</th>
              <th>카테고리</th>
              <th>영화수</th>
              <th>순서</th>
              <th>등록자</th>
              <th>등록일시</th>
              <th>수정자</th>
              <th>수정일시</th>
              <th>활성</th>
              <th>
                <VisuallyHidden asChild>
                <span>동작</span>
              </VisuallyHidden>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11}>
                  <ContentPlaceholderRoot>등록된 문구가 없습니다.</ContentPlaceholderRoot>
                </td>
              </tr>
            )}
            {paginated.map((category) => (
              <tr key={category.id} className={category.is_active ? undefined : styles.inactive}>
                <td>
                  {/*
                    알약 버튼에 보이는 글자. 실제 알약처럼 그려 운영자가
                    길이를 눈으로 가늠할 수 있게 한다 — 여덟 자를 넘으면
                    화면에서 줄바꿈이 난다.
                  */}
                  {category.short_label ? (
                    <span className={styles.pill}>{category.short_label}</span>
                  ) : (
                    <span className={ui.muted}>—</span>
                  )}
                </td>
                <td className={`${styles.name} ${styles.promptCol}`}>{category.name}</td>
                <td>
                  {/*
                    이 문구가 묶는 카테고리 코드들. 운영자가 카테고리 관리에서
                    보는 것과 같은 글자라 두 화면을 오갈 때 눈으로 이어진다.

                    실재하지 않는 코드는 붉게 표시한다 — 배열에 FK가 없어
                    카테고리가 지워지면 죽은 코드가 남을 수 있다(011).
                    뷰가 unknown_codes로 미리 골라 준다.
                  */}
                  <div className={styles.codeList}>
                    {category.category_codes.map((code) => (
                      <code
                        key={code}
                        className={
                          category.unknown_codes?.includes(code) ? styles.codeDead : styles.code
                        }
                        title={category.unknown_codes?.includes(code) ? "없는 카테고리입니다" : undefined}
                      >
                        {code}
                      </code>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={styles.movieCount}>{category.movie_count}</span>
                  <span className={ui.muted}>편</span>
                </td>
                <td>{category.sort_order}</td>
                <td>
                  <AdminChip name={category.created_by} />
                </td>
                <td>
                  <DateTimeCell value={category.created_at} />
                </td>
                <td>
                  <AdminChip name={category.updated_by} />
                </td>
                <td>
                  <DateTimeCell value={category.updated_at} />
                </td>
                <td>
                  <SwitchRoot
                    /* 표 안에서는 본문 글자 크기에 맞춘다. Seed Switch의 최소 크기다. */
                    size="16"
                    checked={category.is_active}
                    onCheckedChange={() => setConfirmActive(category)}
                  >
                    <SwitchControl>
                      <SwitchThumb />
                    </SwitchControl>
                    <SwitchHiddenInput aria-label={`${category.name} 활성화`} />
                  </SwitchRoot>
                </td>
                <td>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={ui.textButton}
                      aria-label={`${category.name} 수정`}
                      onClick={() => openEdit(category)}
                    >
                      <IconEdit size={12} />
                    </button>
                    <button
                      type="button"
                      className={ui.dangerButton}
                      aria-label={`${category.name} 삭제`}
                      onClick={() => setConfirmDelete(category)}
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        title="화면 문구 삭제"
        description={
          confirmDelete
            ? `“${confirmDelete.name}” 문구를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`
            : ""
        }
        confirmLabel="삭제"
        tone="critical"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete.id, confirmDelete.name)}
        onClose={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        open={confirmActive !== null}
        title={confirmActive?.is_active ? "비활성화" : "활성화"}
        description={
          confirmActive
            ? `“${confirmActive.name}” 문구를 ${confirmActive.is_active ? "비활성화" : "활성화"}하시겠습니까?`
            : ""
        }
        confirmLabel={confirmActive?.is_active ? "비활성 적용" : "활성 적용"}
        tone={confirmActive?.is_active ? "critical" : "brand"}
        onConfirm={() => confirmActive && void toggleActive(confirmActive.id)}
        onClose={() => setConfirmActive(null)}
      />

      <Modal
        open={open}
        title={editTarget ? "화면 문구 수정" : "화면 문구 추가"}
        onClose={() => setOpen(false)}
      
        footer={
          <>
        <ActionButton type="button" variant="neutralWeak" size="medium" onClick={() => setOpen(false)}>
          취소
        </ActionButton>
        <ActionButton
          type="button"
          variant="brandSolid"
          size="medium"
          disabled={!isValid}
          onClick={() => void handleSave()}
        >
          저장
        </ActionButton>
          </>
        }
      >
        {/*
          카테고리 관리에 등록한 값에서 고른다. 여럿 고를 수 있고, 고른
          순서대로 저장된다 — 화면에도 그 순서로 보인다.

          드롭다운이 아니라 토글 목록으로 둔다. 여럿을 고르는 일이고,
          카테고리가 열넷이라 한눈에 들어온다. 드롭다운이면 무엇을 이미
          골랐는지 열어 봐야 안다.
        */}
        <FieldRoot>
          <FieldHeader>
            <FieldLabel>카테고리 *</FieldLabel>
          </FieldHeader>
          {movieCategories.length === 0 ? (
            <p className={ui.caption}>먼저 카테고리 관리에서 카테고리를 등록하세요.</p>
          ) : (
            <div className={styles.codePicker}>
              {movieCategories.map((c) => {
                const picked = form.category_codes.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    aria-pressed={picked}
                    className={picked ? styles.codeChipOn : styles.codeChip}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        category_codes: picked
                          ? f.category_codes.filter((x) => x !== c.code)
                          : [...f.category_codes, c.code],
                      }))
                    }
                  >
                    {c.code}
                    <span className={ui.muted}> {c.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className={ui.caption}>
            {form.category_codes.length > 0
              ? `선택: ${form.category_codes.join(", ")}`
              : "하나 이상 고르세요. 고른 카테고리의 영화를 합쳐 셉니다."}
          </p>
        </FieldRoot>

        {/*
          알약 버튼에 보이는 글자. 짧아야 한다 — 홈 화면에서 알약 서넛이
          한 줄에 들어가야 하고, 길면 줄바꿈이 나면서 줄이 무너진다.
          비워 두면 알약으로 쓰지 않는다(서버가 null로 저장한다).
        */}
        <FieldRoot>
          <FieldHeader>
            <FieldLabel>알약 이름</FieldLabel>
          </FieldHeader>
          <TextFieldRoot
            value={form.short_label}
            onValueChange={(v) => setForm((f) => ({ ...f, short_label: v }))}
            size="medium"
          >
            <TextFieldInput placeholder="오컬트" maxLength={20} />
          </TextFieldRoot>
          <p className={ui.caption}>
            버튼에 보이는 글자입니다. 4~7자를 권합니다. 비우면 알약으로 쓰지 않습니다.
          </p>
        </FieldRoot>

        {/*
          알약을 누르면 입력창에 채워지고, 그대로 챗봇에게 전달된다.
          여러 알약을 누르면 이어붙으므로 낱말이 아니라 문장으로 쓴다.
        */}
        <FieldRoot>
          <FieldHeader>
            <FieldLabel>입력창에 채워지는 문장 *</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} size="medium">
            <TextFieldInput placeholder="등골 서늘한 한국식 공포·오컬트 영화를 추천해 주세요." />
          </TextFieldRoot>
          <p className={ui.caption}>
            이 문장이 그대로 챗봇에게 갑니다. 여러 알약을 누르면 이어붙으니 문장으로 쓰세요.
          </p>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>설명</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={form.description} onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} size="medium">
            <TextFieldInput placeholder="카테고리 설명" />
          </TextFieldRoot>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>정렬 순서</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={String(form.sort_order)} onValueChange={(v) => setForm((f) => ({ ...f, sort_order: Number.parseInt(v, 10) || 1 }))} size="medium">
            <TextFieldInput type="number" />
          </TextFieldRoot>
        </FieldRoot>

      </Modal>
    </div>
  );
}
