/** Conversation namespace adapter and its four additional messages. */
import * as base from '../../shared/conversation-dictionaries.ts'

export const NS = 'modern-conversation'

export const zh = {
  ...base.zh,
  'session.tabVisibility': "视图标签",
  'session.hideTab': "隐藏{name}标签",
  'session.showTab': "显示{name}标签",
  'settings.saveFailed': "保存失败，已恢复已保存的设置。请重试。",
}

export type ConversationKey = keyof typeof zh

export const en = {
  ...base.en,
  'session.tabVisibility': "View tabs",
  'session.hideTab': "Hide {name} tab",
  'session.showTab': "Show {name} tab",
  'settings.saveFailed': "Could not save. The saved setting has been restored. Please try again.",
} satisfies Record<ConversationKey, string>

export const ja = {
  ...base.ja,
  'session.tabVisibility': "ビュータブ",
  'session.hideTab': "{name}タブを非表示",
  'session.showTab': "{name}タブを表示",
  'settings.saveFailed': "保存できませんでした。保存済みの設定に戻しました。もう一度お試しください。",
} satisfies Record<ConversationKey, string>

export const es = {
  ...base.es,
  'session.tabVisibility': "Pestañas de vistas",
  'session.hideTab': "Ocultar pestaña {name}",
  'session.showTab': "Mostrar pestaña {name}",
  'settings.saveFailed': "No se pudo guardar. Se ha restaurado el ajuste guardado. Inténtalo de nuevo.",
} satisfies Record<ConversationKey, string>

export const fr = {
  ...base.fr,
  'session.tabVisibility': "Onglets de vue",
  'session.hideTab': "Masquer l’onglet {name}",
  'session.showTab': "Afficher l’onglet {name}",
  'settings.saveFailed': "Enregistrement impossible. Le réglage enregistré a été rétabli. Réessayez.",
} satisfies Record<ConversationKey, string>

export const de = {
  ...base.de,
  'session.tabVisibility': "Ansichtsregister",
  'session.hideTab': "Register {name} ausblenden",
  'session.showTab': "Register {name} anzeigen",
  'settings.saveFailed': "Speichern fehlgeschlagen. Die gespeicherte Einstellung wurde wiederhergestellt. Bitte erneut versuchen.",
} satisfies Record<ConversationKey, string>

export const ru = {
  ...base.ru,
  'session.tabVisibility': "Вкладки представлений",
  'session.hideTab': "Скрыть вкладку {name}",
  'session.showTab': "Показать вкладку {name}",
  'settings.saveFailed': "Не удалось сохранить. Восстановлена сохранённая настройка. Повторите попытку.",
} satisfies Record<ConversationKey, string>

export const pt = {
  ...base.pt,
  'session.tabVisibility': "Abas de visualização",
  'session.hideTab': "Ocultar aba {name}",
  'session.showTab': "Mostrar aba {name}",
  'settings.saveFailed': "Não foi possível salvar. A configuração salva foi restaurada. Tente novamente.",
} satisfies Record<ConversationKey, string>
