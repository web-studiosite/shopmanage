/* ============================================
   SHOP ADMINISTRATION ERP
   supabase.js - Integração Supabase + Offline Fallback
   ============================================ */

const SupabaseAPI = {
  client: null,
  online: navigator.onLine,
  syncQueue: [],

  // CONFIGURAÇÃO JÁ DEFINIDA
  config: {
    url: 'https://wyesnptpaobrfepszrdk.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5ZXNucHRwYW9icmZlcHN6cmRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTg4NjgsImV4cCI6MjA5NDA3NDg2OH0.X4oWiiSP66Wz2-ZI-fU-h9yodTp-LxlrZicEBd__pCQ'
  },

  /* === INICIALIZAÇÃO === */

  async init() {
    try {
      this.client = supabase.createClient(
        this.config.url,
        this.config.key,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        }
      );

      await this.testConnection();

    } catch (err) {
      console.warn(
        'Supabase não disponível, modo offline:',
        err.message
      );

      this.client = null;
    }

    // LISTENERS DE CONECTIVIDADE
    window.addEventListener('online', () => {
      this.online = true;
      this.onOnline();
    });

    window.addEventListener('offline', () => {
      this.online = false;
      this.onOffline();
    });

    // CARREGAR FILA DE SINCRONIZAÇÃO
    this.syncQueue = Formulas.storageGet(
      'sync_queue',
      []
    );

    return this;
  },

  async testConnection() {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('produtos')
        .select('*')
        .limit(1);

      if (error) throw error;

      this.online = true;

      console.log('Supabase conectado');

      return true;

    } catch (err) {

      console.warn(
        'Falha na conexão:',
        err.message
      );

      this.online = false;

      return false;
    }
  },

  isOnline() {
    return this.online && this.client !== null;
  },

  /* === CALLBACKS === */

  onOnline() {
    console.log('Sistema online - sincronizando...');
    this.showToast(
      'Sincronizando dados...',
      'info'
    );

    this.processSyncQueue();
  },

  onOffline() {
    console.log(
      'Sistema offline - usando localStorage'
    );

    this.showToast(
      'Modo offline ativado',
      'warning'
    );
  },

  /* === CRUD === */

  async select(table, options = {}) {

    const {
      columns = '*',
      filters = {},
      order = {},
      limit = null
    } = options;

    if (this.isOnline()) {

      try {

        let query = this.client
          .from(table)
          .select(columns);

        Object.entries(filters).forEach(
          ([col, val]) => {

            if (Array.isArray(val)) {

              query = query.in(col, val);

            } else if (
              typeof val === 'object' &&
              val.op
            ) {

              query = query.filter(
                col,
                val.op,
                val.value
              );

            } else {

              query = query.eq(col, val);
            }
          }
        );

        if (order.column) {

          query = query.order(
            order.column,
            {
              ascending:
                order.ascending !== false
            }
          );
        }

        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } =
          await query;

        if (error) throw error;

        // CACHE LOCAL
        Formulas.storageSet(
          `table_${table}`,
          data || []
        );

        return {
          data: data || [],
          error: null,
          fromCache: false
        };

      } catch (err) {

        console.warn(
          `Erro Supabase (${table}):`,
          err.message
        );

        return this.getFromCache(table);
      }
    }

    return this.getFromCache(table);
  },

  async insert(table, data) {

    if (!data || typeof data !== 'object') {

      return {
        data: null,
        error: 'Dados inválidos'
      };
    }

    const record = {
      ...data,
      id:
        data.id ||
        Formulas.generateId(),
      created_at:
        data.created_at ||
        Formulas.getAgora(),
      updated_at:
        Formulas.getAgora()
    };

    if (this.isOnline()) {

      try {

        const {
          data: result,
          error
        } = await this.client
          .from(table)
          .insert(record)
          .select()
          .single();

        if (error) throw error;

        this.updateLocalCache(
          table,
          result
        );

        return {
          data: result,
          error: null
        };

      } catch (err) {

        console.warn(
          `Insert erro (${table}):`,
          err.message
        );

        return this.queueOperation(
          'insert',
          table,
          record
        );
      }
    }

    return this.queueOperation(
      'insert',
      table,
      record
    );
  },

  async update(table, id, data) {

    const record = {
      ...data,
      updated_at:
        Formulas.getAgora()
    };

    if (this.isOnline()) {

      try {

        const {
          data: result,
          error
        } = await this.client
          .from(table)
          .update(record)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        this.updateLocalCacheItem(
          table,
          result
        );

        return {
          data: result,
          error: null
        };

      } catch (err) {

        console.warn(
          `Update erro (${table}):`,
          err.message
        );

        return this.queueOperation(
          'update',
          table,
          { id, ...record }
        );
      }
    }

    return this.queueOperation(
      'update',
      table,
      { id, ...record }
    );
  },

  async delete(table, id) {

    if (this.isOnline()) {

      try {

        const { error } =
          await this.client
            .from(table)
            .delete()
            .eq('id', id);

        if (error) throw error;

        this.removeFromLocalCache(
          table,
          id
        );

        return { error: null };

      } catch (err) {

        console.warn(
          `Delete erro (${table}):`,
          err.message
        );

        return this.queueOperation(
          'delete',
          table,
          { id }
        );
      }
    }

    return this.queueOperation(
      'delete',
      table,
      { id }
    );
  },

  /* === CACHE LOCAL === */

  getFromCache(table) {

    const data =
      Formulas.storageGet(
        `table_${table}`,
        []
      );

    return {
      data,
      error: null,
      fromCache: true
    };
  },

  updateLocalCache(
    table,
    newRecords
  ) {

    if (!Array.isArray(newRecords)) {
      newRecords = [newRecords];
    }

    const existing =
      Formulas.storageGet(
        `table_${table}`,
        []
      );

    const merged = [...existing];

    newRecords.forEach(rec => {

      const idx = merged.findIndex(
        e => e.id === rec.id
      );

      if (idx >= 0) {
        merged[idx] = rec;
      } else {
        merged.push(rec);
      }
    });

    Formulas.storageSet(
      `table_${table}`,
      merged
    );
  },

  updateLocalCacheItem(
    table,
    record
  ) {

    const existing =
      Formulas.storageGet(
        `table_${table}`,
        []
      );

    const idx = existing.findIndex(
      e => e.id === record.id
    );

    if (idx >= 0) {
      existing[idx] = record;
    } else {
      existing.push(record);
    }

    Formulas.storageSet(
      `table_${table}`,
      existing
    );
  },

  removeFromLocalCache(
    table,
    id
  ) {

    const existing =
      Formulas.storageGet(
        `table_${table}`,
        []
      );

    Formulas.storageSet(
      `table_${table}`,
      existing.filter(
        e => e.id !== id
      )
    );
  },

  /* === FILA === */

  queueOperation(
    operation,
    table,
    data
  ) {

    const op = {
      operation,
      table,
      data,
      timestamp:
        Formulas.getAgora(),
      synced: false
    };

    this.syncQueue.push(op);

    Formulas.storageSet(
      'sync_queue',
      this.syncQueue
    );

    this.applyLocalOperation(
      operation,
      table,
      data
    );

    return {
      data,
      error: null,
      queued: true
    };
  },

  applyLocalOperation(
    operation,
    table,
    data
  ) {

    const existing =
      Formulas.storageGet(
        `table_${table}`,
        []
      );

    switch (operation) {

      case 'insert':
      case 'upsert':

        const idx =
          existing.findIndex(
            e => e.id === data.id
          );

        if (idx >= 0) {
          existing[idx] = {
            ...existing[idx],
            ...data
          };
        } else {
          existing.push(data);
        }

        break;

      case 'update':

        const upIdx =
          existing.findIndex(
            e => e.id === data.id
          );

        if (upIdx >= 0) {

          existing[upIdx] = {
            ...existing[upIdx],
            ...data
          };
        }

        break;

      case 'delete':

        Formulas.storageSet(
          `table_${table}`,
          existing.filter(
            e => e.id !== data.id
          )
        );

        return;
    }

    Formulas.storageSet(
      `table_${table}`,
      existing
    );
  },

  async processSyncQueue() {

    if (
      !this.isOnline() ||
      this.syncQueue.length === 0
    ) {
      return;
    }

    const pending =
      this.syncQueue.filter(
        op => !op.synced
      );

    let synced = 0;

    for (const op of pending) {

      try {

        let result;

        switch (op.operation) {

          case 'insert':

            result =
              await this.client
                .from(op.table)
                .insert(op.data)
                .select()
                .single();

            break;

          case 'update':

            result =
              await this.client
                .from(op.table)
                .update(op.data)
                .eq(
                  'id',
                  op.data.id
                )
                .select()
                .single();

            break;

          case 'delete':

            result =
              await this.client
                .from(op.table)
                .delete()
                .eq(
                  'id',
                  op.data.id
                );

            break;
        }

        if (result.error) {
          throw result.error;
        }

        op.synced = true;

        synced++;

      } catch (err) {

        console.warn(
          'Falha ao sincronizar:',
          err.message
        );
      }
    }

    this.syncQueue =
      this.syncQueue.filter(
        op => !op.synced
      );

    Formulas.storageSet(
      'sync_queue',
      this.syncQueue
    );

    if (synced > 0) {

      this.showToast(
        `${synced} operações sincronizadas`,
        'success'
      );
    }
  },

  /* === TOAST === */

  showToast(
    message,
    type = 'info'
  ) {

    if (
      window.App &&
      window.App.toast
    ) {

      window.App.toast(
        message,
        type
      );

    } else {

      console.log(
        `[${type}] ${message}`
      );
    }
  },

  /* === STATUS === */

  getStats() {

    return {
      online:
        this.isOnline(),

      config:
        !!this.config?.url,

      queueSize:
        this.syncQueue.filter(
          op => !op.synced
        ).length,

      cachedTables:
        Object.keys(localStorage)
          .filter(k =>
            k.startsWith(
              'table_'
            )
          )
          .map(k =>
            k.replace(
              'table_',
              ''
            )
          )
    };
  }
};

// GLOBAL
window.SupabaseAPI = SupabaseAPI;

/* ============================================
   AUTO START
   ============================================ */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    await SupabaseAPI.init();

    console.log(
      'ERP Supabase iniciado'
    );
  }
);
