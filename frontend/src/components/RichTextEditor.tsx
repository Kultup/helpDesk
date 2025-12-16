import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  modules?: any;
  formats?: string[];
  style?: React.CSSProperties;
  theme?: string;
  onImageUpload?: () => void;
}

export interface RichTextEditorRef {
  getEditor: () => Quill | null;
  getContent: () => string;
  setContent: (content: string) => void;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value, onChange, placeholder, modules, formats, style, theme = 'snow', onImageUpload }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<Quill | null>(null);
    const isInitializedRef = useRef(false);

    useImperativeHandle(ref, () => ({
      getEditor: () => quillRef.current,
      getContent: () => quillRef.current?.root.innerHTML || '',
      setContent: (content: string) => {
        if (quillRef.current) {
          quillRef.current.root.innerHTML = content;
        }
      }
    }));

    useEffect(() => {
      if (!containerRef.current || isInitializedRef.current) return;

      const container = containerRef.current;
      const editor = document.createElement('div');
      container.appendChild(editor);

      let finalModules = modules;
      if (!finalModules) {
        finalModules = {
          toolbar: {
            container: [
              [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
              [{ 'font': [] }],
              [{ 'size': [] }],
              ['bold', 'italic', 'underline', 'strike', 'blockquote'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
              [{ 'color': [] }, { 'background': [] }],
              [{ 'align': [] }],
              ['link', 'image', 'video'],
              ['clean']
            ],
            handlers: onImageUpload ? {
              image: onImageUpload
            } : undefined
          }
        };
      } else if (finalModules.toolbar && onImageUpload) {
        // Якщо modules передано, але потрібно додати обробник зображень
        if (finalModules.toolbar.handlers) {
          finalModules.toolbar.handlers.image = onImageUpload;
        } else {
          finalModules.toolbar.handlers = { image: onImageUpload };
        }
      }

      const quill = new Quill(editor, {
        theme: theme,
        placeholder: placeholder || 'Введіть текст...',
        modules: finalModules,
        formats: formats || [
          'header', 'font', 'size',
          'bold', 'italic', 'underline', 'strike', 'blockquote',
          'list', 'bullet', 'indent',
          'color', 'background',
          'align',
          'link', 'image', 'video'
        ]
      });

      if (value) {
        quill.root.innerHTML = value;
      }

      quill.on('text-change', () => {
        const content = quill.root.innerHTML;
        onChange(content);
      });

      quillRef.current = quill;
      isInitializedRef.current = true;

      return () => {
        if (container.contains(editor)) {
          container.removeChild(editor);
        }
        quillRef.current = null;
        isInitializedRef.current = false;
      };
    }, []);

    // Оновлюємо контент, якщо value змінився ззовні
    useEffect(() => {
      if (quillRef.current && value !== quillRef.current.root.innerHTML) {
        const selection = quillRef.current.getSelection();
        quillRef.current.root.innerHTML = value;
        if (selection) {
          quillRef.current.setSelection(selection);
        }
      }
    }, [value]);

    return (
      <div 
        ref={containerRef} 
        style={style}
        className="rich-text-editor"
      />
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
