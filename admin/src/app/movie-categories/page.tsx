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

import { SelectField } from "@/components/select-field";
import { PageSub, PageTitle } from "@/components/typography";
import { ConfirmModal } from "@/components/confirm-modal";
import { DateTimeCell } from "@/components/date-time-cell";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/snackbar";
import { AdminChip } from "@/components/movie-cell";
import { Pagination } from "@/components/pagination";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import {
  CATEGORY_TYPES,
  CURRENT_ADMIN,
  MOCK_MOVIE_CATEGORIES,
  type CategoryType,
  type MovieCategory,
} from "@/lib/mock";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  patchCategory,
} from "@/lib/api";
import { IconAdd, IconCategory, IconEdit, IconMovie, IconTrash } from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

/*
 * 목록을 여기서 다시 적지 않는다. mock.ts가 단일 출처이고 API 검증도 같은
 * 것을 본다 — 화면에만 더하고 API를 놓치면 "저장했습니다" 뒤에 422가 난다.
 */
const TYPE_OPTIONS = CATEGORY_TYPES;

const TYPE_LABELS: Record<CategoryType, string> = {
  GENRE: "장르",
  MOOD: "분위기",
  THEME: "테마",
  RATING: "관람등급",
  SITUATION: "상황",
};

const TYPE_TONES: Record<CategoryType, string> = {
  GENRE: styles.toneInformative,
  MOOD: styles.toneMagic,
  THEME: styles.tonePositive,
  RATING: styles.toneBrand,
  SITUATION: styles.toneWarning,
};

/*
 * 상황은 영화를 담는 상자가 아니다 — "퇴근 후", "가족과 함께"는 챗봇에게
 * 건네는 말이지 작품 분류가 아니다. 그래서 별칭을 쓰지 않고, 영화 수가
 * 0으로 보이는 것이 정상이다. 화면이 이걸 고장으로 읽히지 않게 알려 준다.
 */
const ALIAS_LESS_TYPES: CategoryType[] = ["SITUATION"];

const TYPE_CARD_TONES: Record<CategoryType, SummaryItem["tone"]> = {
  GENRE: "informative",
  MOOD: "neutral",
  THEME: "positive",
  RATING: "warning",
  SITUATION: "brand",
};

type CategoryForm = {
  code: string;
  name: string;
  type: CategoryType;
  description: string;
  sort_order: number;
  /** 쉼표로 구분해 입력받는다. 저장할 때 배열로 나눈다. */
  match_keywords: string;
};

const EMPTY_FORM: CategoryForm = {
  code: "",
  name: "",
  type: "GENRE",
  description: "",
  sort_order: 1,
  match_keywords: "",
};

/** 쉼표로 적은 낱말을 배열로. 빈 값과 공백은 서버가 또 걸러낸다. */
const splitAliases = (text: string) =>
  text
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

const PAGE_SIZE = 10;

export default function MovieCategoriesPage() {
  /*
   * 카테고리는 실 DB에서 온다(/admin-api/movie-categories).
   *
   * 목으로 시작해 응답이 오면 갈아끼운다 — 처음 그리는 순간에도 빈 표가
   * 보이지 않는다. DB가 없으면 503이 오고 목이 남는데, 그때 저장을 누르면
   * 실패 이유가 토스트로 뜨므로 "저장된 척"은 하지 않는다.
   */
  const [categories, setCategories] = useState<MovieCategory[]>(MOCK_MOVIE_CATEGORIES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal).then((items) => {
      if (items && !controller.signal.aborted) setCategories(items);
    });
    return () => controller.abort();
  }, []);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState<CategoryType | "ALL">("ALL");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MovieCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<MovieCategory | null>(null);
  const [confirmActive, setConfirmActive] = useState<MovieCategory | null>(null);

  const filtered = typeFilter === "ALL" ? categories : categories.filter((c) => c.type === typeFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 필터가 좁혀져 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const typeCount = TYPE_OPTIONS.reduce<Record<CategoryType, number>>(
    (acc, type) => {
      acc[type] = categories.filter((c) => c.type === type).length;
      return acc;
    },
    { GENRE: 0, MOOD: 0, THEME: 0, RATING: 0, SITUATION: 0 },
  );

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, sort_order: categories.length + 1 });
    setOpen(true);
  };

  const openEdit = (category: MovieCategory) => {
    setEditTarget(category);
    setForm({
      code: category.code,
      name: category.name,
      type: category.type,
      // DB는 설명이 비면 null을 준다. 그대로 넣으면 input이 비제어로 바뀐다.
      description: category.description ?? "",
      sort_order: category.sort_order,
      match_keywords: (category.match_keywords ?? []).join(", "),
    });
    setOpen(true);
  };

  const isValid = form.code.trim() !== "" && form.name.trim() !== "";

  /*
   * 저장이 끝난 뒤에 화면을 바꾼다. 영화 인증·감상평과 같은 이유다 —
   * 실패했는데 목록에 새 카테고리가 떠 있는 순간을 만들지 않는다.
   *
   * 서버가 돌려준 행으로 교체한다. 여기서 만든 값(id, 시각)은 DB에 실제로
   * 저장된 것과 어긋난다. 코드도 서버가 대문자로 바꿔 저장한다.
   */
  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      sort_order: form.sort_order,
      match_keywords: splitAliases(form.match_keywords),
      admin: CURRENT_ADMIN.name,
    };
    const res = editTarget
      ? await patchCategory(editTarget.id, payload)
      : // code와 type은 만들 때만 정한다. 뒤에 바꾸면 이미 저장된 회원 취향과
        // 영화 분류가 가리키는 곳이 사라진다.
        await createCategory({ ...payload, code: form.code.trim(), type: form.type });
    setSaving(false);

    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) =>
      editTarget
        ? prev.map((c) => (c.id === editTarget.id ? res.category : c))
        : [...prev, res.category],
    );
    toast(`“${res.category.name}” 카테고리를 저장했습니다.`, "positive");
    setOpen(false);
  };

  const handleDelete = async (id: number, name: string) => {
    const res = await deleteCategory(id);
    if (!res.ok) {
      // 영화가 붙어 있으면 DB가 막는다. 무엇이 문제인지 그대로 보여준다.
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast(`“${name}” 카테고리를 삭제했습니다.`, "critical");
  };

  const toggleActive = async (id: number) => {
    const current = categories.find((c) => c.id === id);
    if (!current) return;
    const res = await patchCategory(id, {
      is_active: !current.is_active,
      admin: CURRENT_ADMIN.name,
    });
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? res.category : c)));
  };

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: categories.length,
      caption: "등록된 카테고리",
      icon: IconCategory,
      tone: "brand",
      active: typeFilter === "ALL",
      onClick: () => setTypeFilter("ALL"),
    },
    ...TYPE_OPTIONS.map<SummaryItem>((type) => ({
      key: type,
      label: TYPE_LABELS[type],
      value: typeCount[type],
      caption: "등록된 카테고리",
      icon: IconMovie,
      tone: TYPE_CARD_TONES[type],
      active: typeFilter === type,
      onClick: () => setTypeFilter(typeFilter === type ? "ALL" : type),
    })),
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>카테고리 관리</PageTitle>
          <PageSub>영화 분류에 사용되는 카테고리 등록·수정·삭제</PageSub>
        </div>
        <ActionButton type="button" variant="brandSolid" size="small" onClick={openAdd}>
          <IconAdd size={14} />
          카테고리 추가
        </ActionButton>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.card}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>코드</th>
              <th>이름</th>
              <th>분류</th>
              <th>설명</th>
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
                <td colSpan={12}>
                  <ContentPlaceholderRoot>카테고리가 없습니다.</ContentPlaceholderRoot>
                </td>
              </tr>
            )}
            {paginated.map((category) => (
              <tr key={category.id} className={category.is_active ? undefined : styles.inactive}>
                <td>
                  <code className={styles.code}>{category.code}</code>
                </td>
                <td className={styles.name}>{category.name}</td>
                <td>
                  <span className={`${styles.typeTag} ${TYPE_TONES[category.type]}`}>
                    {TYPE_LABELS[category.type]}
                  </span>
                </td>
                <td className={ui.muted}>{category.description}</td>
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
        title="카테고리 삭제"
        description={
          confirmDelete
            ? `“${confirmDelete.name}” 카테고리를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.`
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
            ? `“${confirmActive.name}” 카테고리를 ${confirmActive.is_active ? "비활성화" : "활성화"}하시겠습니까?`
            : ""
        }
        confirmLabel={confirmActive?.is_active ? "비활성 적용" : "활성 적용"}
        tone={confirmActive?.is_active ? "critical" : "brand"}
        onConfirm={() => confirmActive && void toggleActive(confirmActive.id)}
        onClose={() => setConfirmActive(null)}
      />

      <Modal
        open={open}
        title={editTarget ? "카테고리 수정" : "카테고리 추가"}
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
          disabled={!isValid || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "저장 중…" : "저장"}
        </ActionButton>
          </>
        }
      >
        <div className={styles.formGrid}>
          <FieldRoot>
          <FieldHeader>
            <FieldLabel>코드 *</FieldLabel>
          </FieldHeader>
          {/*
            수정할 때는 코드와 분류를 잠근다. 둘은 PATCH가 받지 않는다
            (422로 막는다) — 이미 저장된 회원 취향과 영화 분류가 이 값을
            가리키기 때문이다. 그런데 칸이 열려 있으면 운영자가 고쳐 놓고
            "저장했습니다"를 본 뒤 안 바뀐 것을 나중에야 알게 된다.
          */}
          <TextFieldRoot
            value={form.code}
            onValueChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
            size="medium"
            readOnly={editTarget !== null}
          >
            {/*
              Root의 readOnly는 값 변경을 막고 회색으로 칠하지만 input에
              native readonly를 달아 주지는 않는다(data-readonly만 붙는다).
              화면 낭독기를 위해 aria-readonly를 직접 붙인다.
            */}
            <TextFieldInput
              placeholder="CATEGORY_CODE"
              aria-readonly={editTarget !== null}
            />
          </TextFieldRoot>
        </FieldRoot>
          <FieldRoot>
          <FieldHeader>
            <FieldLabel>분류</FieldLabel>
          </FieldHeader>
          <SelectField
              id="mc-type"
              ariaLabel="분류"
              placeholder="분류 선택"
              value={form.type}
              options={TYPE_OPTIONS.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
              onChange={(v) => setForm((f) => ({ ...f, type: v as CategoryType }))}
              disabled={editTarget !== null}
            />
        </FieldRoot>
        </div>
        {editTarget && (
          <p className={ui.caption}>
            코드와 분류는 바꿀 수 없습니다. 새로 만들고 옛 카테고리를 비활성으로 두세요.
          </p>
        )}

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>이름 *</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={form.name} onValueChange={(v) => setForm((f) => ({ ...f, name: v }))} size="medium">
            <TextFieldInput placeholder="카테고리 이름" />
          </TextFieldRoot>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>설명</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={form.description} onValueChange={(v) => setForm((f) => ({ ...f, description: v }))} size="medium">
            <TextFieldInput placeholder="카테고리 설명" />
          </TextFieldRoot>
        </FieldRoot>

        {/*
          자동 분류 낱말 — 수집처가 준 낱말을 이 카테고리로 모은다.

          여기에 적은 낱말이 영화의 source_keywords에 **정확히 같은 표기로**
          있으면 그 영화가 자동으로 이 카테고리에 붙는다. 5,312편을 손으로
          붙일 수는 없으므로 이것이 사실상 유일한 분류 수단이다.

          ⚠️ aliases와 다른 칸이다(마이그레이션 013). aliases는 WAS가 의미
          검색어를 넓히는 데 쓰는 어구('소설 원작')이고, 이쪽은 정확 일치용
          표기('소설원작')다. 한 칸을 함께 쓰다가 WAS 시드에 덮어써져 자동
          분류가 343편에서 124편으로 떨어진 적이 있다.

          쉼표로 나눈다. 낱말이 수십 개 수준이라 칩 UI까지는 과하다.
        */}
        <FieldRoot>
          <FieldHeader>
            <FieldLabel>자동 분류 낱말</FieldLabel>
          </FieldHeader>
          <TextFieldRoot
            value={form.match_keywords}
            onValueChange={(v) => setForm((f) => ({ ...f, match_keywords: v }))}
            size="medium"
          >
            <TextFieldInput placeholder="소설원작, 만화원작, 웹툰원작" />
          </TextFieldRoot>
          <p className={ui.caption}>
            {ALIAS_LESS_TYPES.includes(form.type)
              ? "상황 카테고리는 낱말을 쓰지 않습니다. 영화를 담는 상자가 아니라 챗봇에게 건네는 말이라, 영화 수가 0인 것이 정상입니다."
              : "쉼표로 구분합니다. 수집처 표기 그대로 적으세요 — 띄어쓰기가 다르면 걸리지 않습니다."}
          </p>
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
