import { createContext, forwardRef, useContext } from "react";

const TabsContext = createContext({});

export const Tabs = forwardRef(({ value, onValueChange, children, className = "" }, ref) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
});
Tabs.displayName = "Tabs";

export const TabsList = forwardRef(({ children, className = "" }, ref) => {
  return (
    <div ref={ref} role="tablist" className={className}>
      {children}
    </div>
  );
});
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef(({ value, children, className = "" }, ref) => {
  const { value: selectedValue, onValueChange } = useContext(TabsContext);
  const isSelected = value === selectedValue;

  return (
    <button
      ref={ref}
      role="tab"
      aria-selected={isSelected}
      onClick={() => onValueChange?.(value)}
      className={className}
    >
      {children}
    </button>
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef(({ value, children }, ref) => {
  const { value: selectedValue } = useContext(TabsContext);
  if (value !== selectedValue) return null;

  return (
    <div ref={ref} role="tabpanel" tabIndex={0}>
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent"; 